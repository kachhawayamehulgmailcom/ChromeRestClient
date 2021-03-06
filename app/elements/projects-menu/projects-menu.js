Polymer({
  is: 'projects-menu',

  behaviors: [
    ArcBehaviors.MenuListBehavior
  ],

  properties: {
    // current query options
    queryOptions: {
      type: Object,
      readOnly: true,
      value: function() {
        return {
          // jscs:disable
          include_docs: true
          // jscs:enable
        };
      }
    },
    includeDocs: {
      type: Boolean,
      value: true
    },
    selectedProject: String,
    route: String
  },

  observers: [
    '_projectsListChanged(items.*)',
    'selectedProjectChanged(selectedProject)'
  ],

  attached: function() {
    this.listen(window, 'project-object-deleted', '_projectDeleted');
    this.listen(window, 'project-object-changed', '_updateProject');
    this.listen(window, 'selected-project', '_updateProjectSelection');
    this.listen(window, 'datastrores-destroyed', '_onDatabaseDestroy');
    this.listen(window, 'data-imported', 'refreshProjects');
  },

  detached: function() {
    this.unlisten(window, 'project-object-deleted', '_projectDeleted');
    this.unlisten(window, 'project-object-changed', '_updateProject');
    this.unlisten(window, 'selected-project', '_updateProjectSelection');
    this.unlisten(window, 'datastrores-destroyed', '_onDatabaseDestroy');
    this.unlisten(window, 'data-imported', 'refreshProjects');
  },

  reset: function() {
    if (!this.queryOptions) {
      return; // not ready
    }
    this._setQuerying(false);
    this.set('items', []);
  },

  _resetOnClosed: function(opened) {
    if (opened && (!this.items || !this.items.length)) {
      this._makeQuery();
      return;
    } else if (opened) {
      this.$.list.notifyResize();
    }
  },

  /**
   * Refresh projects list and display new list.
   */
  refreshProjects: function() {
    this.reset();
    this._makeQuery();
  },

  /**
   * Accepts currently selected suggestion and enters it into a text field.
   */
  _acceptSelection: function(e) {
    if (!this.opened) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    var path = e.path;
    var place;
    while (path.length) {
      var elm = path.shift();
      if (elm.nodeType !== 1) {
        continue;
      }
      if (elm.dataset && elm.dataset.place) {
        place = elm.dataset.place;
        break;
      }
    }
    if (!place) {
      return;
    }
    page(place);
  },

  _getDb: function() {
    return new PouchDB('legacy-projects');
  },

  _processResults: function(res) {
    res.sort((a, b) => {
      if (a.order === b.order) {
        return 0;
      }
      if (a.order > b.order) {
        return 1;
      }
      if (a.order < b.order) {
        return -1;
      }
    });
    return res;
  },

  _scrollHandler: function() {},

  _updateProject: function(e, detail) {
    var p = detail.project;
    if (!this.items || !this.items.length) {
      this.push('items', p);
      return;
    }
    var index = this.items.findIndex((i) => i._id === p._id);
    if (index === -1) {
      this.push('items', p);
      return;
    }
    this.set('items.' + index + '.name', p.name);
    this.set('items.' + index + '.order', p.order);
  },
  /**
   * Remove project from the UI as a reaction to `project-object-deleted` event.
   */
  _projectDeleted: function(e) {
    var id = e.detail.id;
    var list = this.items;
    var index = list.findIndex((item) => item._id === id);
    if (index === -1) {
      return;
    }
    this.splice('items', index, 1);
  },

  _updateProjectSelection: function(e, detail) {
    this.set('selectedProject', detail.id);
  },

  _onDatabaseDestroy: function(e) {
    var databases = e.detail.datastores;
    if (!databases || !databases.length) {
      return;
    }
    if (databases.indexOf('legacy-projects') === -1) {
      return;
    }
    this.set('items', []);
    var db = this._getDb();
    db.close().then(function() {
      console.log('The legacy-projects database has been closed.');
    });
  },

  _projectsListChanged: function(record) {
    if (!record || !record.base) {
      return;
    }
    if (record.path !== 'items.splices') {
      // Only when adding to the list
      return;
    }
    // Debounce the work since it will be called on each item insert (which is in a loop).
    this.debounce('items-list-changed-handler', function() {
      let items = this.items;
      if (!items || !items.length) {
        return;
      }
      var projectIds = items.map((item) => {
        return item._id;
      });
      this._findEmptyProjects(projectIds);
      this.$.list.notifyResize();
    }.bind(this), 200);

  },
  /**
   * The function will iterate over the request object keys and check
   * if projects has any request that exists.
   * If it doesn't exists it will mark it as a project without request.
   *
   * @param {Array<String>} projectIds A list of project IDs.
   */
  _findEmptyProjects: function(projectIds) {
    this.debounce('find-empty-projects', function() {
      if (!this._processEmptyWorker) {
        var blob = new Blob([this.$.emptyProjectsProcess.textContent]);
        this._processEmptyWorkerUrl = window.URL.createObjectURL(blob);
        this._processEmptyWorker = new Worker(this._processEmptyWorkerUrl);
        this._processEmptyWorker.onmessage =
          this._processWorkerResponse.bind(this);
      }
      this._processEmptyWorker.postMessage({
        projects: projectIds
      });
    }, 1500);
  },
  // Processes the response form the web worker.
  _processWorkerResponse: function(e) {
    var data = e.data;
    if (data.error) {
      return console.error(data.message);
    }
    this._setEmptyProjects(data.result);
  },
  // Updates the list of items and sets the `isEmpty` property.
  _setEmptyProjects: function(ids) {
    if (!ids || !ids.length) {
      return;
    }
    var list = this.items;
    list.forEach((item, i) => {
      if (ids.indexOf(item._id) !== -1) {
        this.set(['items', i, 'isEmpty'], true);
      }
    });
  },

  _computeProjectSelected: function(pId, selected) {
    return pId === selected;
  },

  selectedProjectChanged: function(selectedProject) {
    if (!selectedProject && selectedProject !== null) {
      this.set('selectedProject', null);
    }
    if (!selectedProject) {
      return;
    }
    if (!this.opened) {
      this.set('opened', true);
    }
  }
});
