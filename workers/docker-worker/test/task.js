/**
@see https://github.com/lightsofapollo/object-factory
@tutorial task_factories
@module taskcluster-client/factory/task
*/
var Factory = require('object-factory');
var Tags = new Factory();

var Payload = new Factory({
  onbuild: function(object) {
    object.command = object.command || ['/bin/bash -c', 'ls -lah'];
    object.env = object.env || {};
    object.features = object.features || {};
  },

  properties: {
    image: 'ubuntu',
    maxRunTime: 600,
    // onbuild above handles this
    // command: []
  }
});

var Metadata = new Factory({
  properties: {
    name: '',
    description: '',
    owner: '',
    source: 'http://localhost'
  }
});

var Task = new Factory({
  onbuild: function(object) {
    object.created = object.created || new Date();

    var defaultDeadline = new Date(object.created);
    defaultDeadline.setHours(defaultDeadline.getHours() + 24);
    object.deadline = object.deadline || defaultDeadline;
    object.scopes = object.scopes || [];
    object.routes = object.routes || [];
  },

  properties: {
    provisionerId: 'dont-spawn-machines',
    // workerType: ''
    retries: 1,
    // created: new Date()
    // deadline: new Date()
    payload: Payload,
    metadata: Metadata,
    tags: Tags
  }
});

module.exports = Task;
