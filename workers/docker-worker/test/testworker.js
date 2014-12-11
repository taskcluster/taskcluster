/**
 * This module spawns an instance of the worker, then submits a given task for
 * this automatically generated workerType and listens for the task completion
 * event.
 */
var slugid = require('slugid');
var request = require('superagent-promise');
var debug = require('debug')('docker-worker:test:testworker');
var util = require('util');
var waitForEvent = require('../lib/wait_for_event');
var split = require('split2');
var loadConfig = require('taskcluster-base/config');
var getArtifact = require('./integration/helper/get_artifact');

var Task = require('taskcluster-task-factory/task');
var Graph = require('taskcluster-task-factory/graph');

var LocalWorker = require('./localworker');
var Queue  = require('taskcluster-client').Queue;
var Scheduler = require('taskcluster-client').Scheduler;
var PulseListener = require('taskcluster-client').PulseListener;
var Promise = require('promise');
var EventEmitter = require('events').EventEmitter;

var queueEvents = new (require('taskcluster-client').QueueEvents);
var schedulerEvents = new (require('taskcluster-client').SchedulerEvents);

/** Test provisioner id, don't change this... */
var PROVISIONER_ID = 'no-provisioning-nope';

function TestWorker(Worker, workerType, workerId) {
  // Load the test time configuration for all the components...
  var config = loadConfig({
    defaults: require('../config/defaults'),
    profile: require('../config/test'),
    filename: 'docker-worker-test'
  });

  this.provisionerId = PROVISIONER_ID;
  this.workerType = workerType || slugid.v4();
  this.workerId = workerId || this.workerType;
  this.worker = new Worker(PROVISIONER_ID, this.workerType, this.workerId);

  this.pulse = config.get('pulse');

  this.queue = new Queue({
    credentials: config.get('taskcluster')
  });

  this.scheduler = new Scheduler({
    credentials: config.get('taskcluster')
  });

  var deadline = new Date();
  deadline.setMinutes(deadline.getMinutes() + 60);

  this.TaskFactory = Task.extend({
    properties: {
      deadline: deadline,
      workerType: this.workerType,
      provisionerId: PROVISIONER_ID,
      metadata: {
        description: 'jonas damn you',
        owner: 'unkown@localhost.local',
        name: 'Task from docker-worker test suite',
        source: 'http://foobar.com'
      }
    }
  });

  EventEmitter.call(this);
}

TestWorker.prototype = {
  __proto__: EventEmitter.prototype,

  /**
  Ensure the worker is connected.
  */
  launch: function* () {
    var proc = yield this.worker.launch();

    // Proxy the exit event so we don't need to query .worker.
    this.worker.process.once('exit', this.emit.bind(this, 'exit'));

    // Process the output(s) to emit events based on the json streams.

    // stderr should not contain any useful logs so just pipe it...
    proc.stderr.pipe(process.stderr);

    // Parse stdout and emit non-json bits to stdout.
    proc.stdout.pipe(split(function(line) {
      try {
        var parsed = JSON.parse(line);
        debug('emit', parsed.type, parsed);
        this.emit(parsed.type, parsed);
      } catch (e) {
        // This is an intentional console log for any line which is not a
        // newline delimited json string.
        console.log(line);
      }
    }.bind(this)));

    // Wait for start event.
    yield waitForEvent(this, 'start');
  },

  terminate: function* () {
    return yield this.worker.terminate();
  },

  /**
  Post a single task to the queue.

  @param {String} taskId in slugid.v4 format.
  @param {Object} taskConfig task config overrides (like .payload, etc..)
  */
  createTask: function* (taskId, taskConfig) {

    taskConfig.schedulerId = 'docker-worker-tests';
    // XXX: This is just a hack really so the validator does not complain.
    taskConfig.taskGroupId = taskId;

    var task = this.TaskFactory.create(taskConfig);
    debug('post to queue %j', task);
    return yield this.queue.createTask(taskId, task);
  },

  /**
  Post a task to the graph with the testing configuration.

  @param {String} graphId task graph id.
  @param {Object} graphConfig for the graph..
  */
  createGraph: function* (graphId, graphConfig) {
    var graph = Graph.create(graphConfig);
    graph.tasks.map(function(graphTask) {
      graphTask.task.schedulerId = 'task-graph-scheduler';
      graphTask.task.workerType = this.workerType;
      graphTask.task.provisionerId = this.provisionerId;
      graphTask.task.taskGroupId = graphId;
      return graphTask;
    }, this);

    debug('post to graph %j', graph);
    return yield this.scheduler.createTaskGraph(graphId, graph);
  },

  /**
  Fetch all the common stats used by the tests.
  */
  fetchTaskStats: function* (taskId, runId) {
    var fetch = yield {
      // Just about every single test needs status of the task...
      status: this.queue.status(taskId),

      // Live logging of the task...
      log: getArtifact(
        { taskId: taskId, runId: runId }, 'public/logs/live.log'
      ),

      // Generally useful for most of the tests...
      artifacts: this.queue.listArtifacts(taskId, runId),
    };

    // XXX: Ugh status.status...
    var status = fetch.status.status;
    var indexedArtifacts =
      fetch.artifacts.artifacts.reduce(function(result, artifact) {
        result[artifact.name] = artifact;
        return result;
      }, {});

    return {
      status: status,
      log: fetch.log,
      artifacts: indexedArtifacts,

      // Current run useful for .success, etc...
      run: status.runs[runId],

      // Useful if you need to run a secondary queue run, etc...
      taskId: taskId,
      runId: runId
    };
  },

  postToScheduler: function* (graphId, graph) {
    // Create and bind the listener which will notify us when the worker
    // completes a task.
    var listener = new PulseListener({
      credentials:      this.pulse
    });

    // Listen for either blocked or finished...
    yield listener.bind(schedulerEvents.taskGraphBlocked({
      taskGraphId: graphId
    }));
    yield listener.bind(schedulerEvents.taskGraphFinished({
      taskGraphId: graphId
    }));

    // Connect to queue and being consuming it...
    yield listener.connect();
    yield listener.resume();

    // Begin listening at the same time we create the task to ensure we get the
    // message at the correct time.
    var creation = yield [
      waitForEvent(listener, 'message'),
      this.createGraph(graphId, graph),
    ];

    // Fetch the final result json.
    var status = creation.shift().payload.status;

    // Close listener we only care about one message at a time.
    try {
      yield listener.close();
    } catch(e) {
      console.log('error during close:', e);
    }

    var graph = yield this.scheduler.inspect(graphId);
    return yield graph.tasks.map(function(task) {
      // Note: that we assume runId 0 here which is fine locally since we know
      // the number of runs but not safe is we wanted to test reruns.
      return this.fetchTaskStats(task.taskId, 0);
    }, this);
  },

  /**
  Post a message to the queue and wait for the results.

  @param {Object} task partial definition to upload.
  */
  postToQueue: function* (task, specifiedTaskId) {
    var taskId = specifiedTaskId ? specifiedTaskId : slugid.v4();

    // Create and bind the listener which will notify us when the worker
    // completes a task.
    var listener = new PulseListener({
      credentials:      this.pulse
    });

    // listen for this one task and only this task...
    yield listener.bind(queueEvents.taskCompleted({
      taskId: taskId
    }));

    yield listener.connect();
    yield listener.resume();

    // Begin listening at the same time we create the task to ensure we get the
    // message at the correct time.
    var creation = yield [
      waitForEvent(listener, 'message'),
      this.createTask(taskId, task),
    ];

    // Fetch the final result json.
    var status = creation.shift().payload.status;
    var runId = status.runs.pop().runId;

    // Close listener we only care about one message at a time.
    try {
      yield listener.close();
    } catch(e) {
      console.log('error during close:', e);
    }

    // Return uniform stats on the worker run (fetching common useful things).
    return yield this.fetchTaskStats(taskId, runId);
  }
};

module.exports = TestWorker;
