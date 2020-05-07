/**
@module taskcluster-client/factory/graph
*/
let Factory = require('object-factory');
let Task = require('./task');
let slugid = require('slugid');

let GraphTask = new Factory({
  onbuild: function(props) {
    props.requires = props.requires || [];
    props.taskId = props.taskId || slugid.v4();
  },

  properties: {
    // requires: []
    label: '',
    reruns: 0,
    task: Task,
  },
});

let GraphMetadata = new Factory({
  properties: {
    name: 'xfoo',
    description: 'bar',
    owner: 'user@local.localhost',
    source: 'task-factory/',
  },
});

let Graph = new Factory({
  onbuild: function(props) {
    props.tags = props.tags || {};
    props.scopes = props.scopes || [];
    props.routes = props.routes || [];
    props.tasks = props.tasks || [];
    props.tasks = props.tasks.map(function(task) {
      return GraphTask.create(task);
    });
  },

  properties: {
    // routing: ''
    // tasks: { 'name': Graph }
    metadata: GraphMetadata,
  },
});

module.exports = Graph;
