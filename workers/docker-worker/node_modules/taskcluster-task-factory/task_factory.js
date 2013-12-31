var Factory = require('object-factory');

// internal machine factory
var Machine = new Factory({
  properties: {
  }
});

var Task = new Factory({
  properties: {
    command: null,
    machine: Machine
  }
});

module.exports = Task;
