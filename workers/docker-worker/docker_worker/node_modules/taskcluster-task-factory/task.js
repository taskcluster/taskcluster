var Factory = require('object-factory');
var Result = require('./result');

var uuid = require('uuid');

var STATES = {
  pending: 'pending',
  running: 'running',
  completed: 'completed'
};

var Task = new Factory({
  properties: {
    version: '0.0.0',
    tags: new Factory(),
    parameters: new Factory(),
    priority: 0,
    max_retries: 0,
    max_runtime_seconds: 7200,
    max_pending_seconds: 86400,
    state: STATES.pending,
    data: new Factory()
  },

  onbuild: function(props) {
    // for convenience set a group uuid if not provided.
    if (!('group_id' in props)) props.group_id = uuid.v4();

    props.command = props.command || [];

    if (props.result) {
      props.result = Result.create(props.result);
    }
  }
});

Task.STATES = STATES;

module.exports = Task;
