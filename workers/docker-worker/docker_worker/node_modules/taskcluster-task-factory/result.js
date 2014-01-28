var Factory = require('object-factory');

var Times = new Factory({
  properties: {
    submitted_timestamp: 0,
    started_timestamp: 100,
    finished_timestamp: 200,
    runtime_seconds: 100
  }
});


var ExtraInfo = new Factory({
  // generic extra info about the result
});

/**
Infrastructure specific result
*/
var Infra = new Factory({
  properties: {}
});

/**
Task result subset of the overall result
*/
var Task = new Factory({
  properties: {
    exit_status: 0
  }
});

var Result = new Factory({
  properties: {
    version: '0.0.0',
    infra_result: Infra,
    task_result: Task,
    extra_info: ExtraInfo,
    times: Times
  }
});

module.exports = Result;
