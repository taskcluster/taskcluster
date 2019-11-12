/**
 * This module spawns an instance of the worker, then submits a given task for
 * this automatically generated workerType and listens for the task completion
 * event.
 */
const slugid = require('slugid');
const Debug = require('debug');
const waitForEvent = require('../src/lib/wait_for_event');
const split = require('split2');
const getArtifact = require('./integration/helper/get_artifact');
const Task = require('./task');
const taskcluster = require('taskcluster-client');
const typedEnvConfig = require('typed-env-config');
const {EventEmitter} = require('events');
const getLogsLocationsFromTask = require('../src/lib/features/logs_location.js');

let debug = Debug('docker-worker:test:testworker');

/** Test provisioner id, don't change this... */
const PROVISIONER_ID = 'null-provisioner';

class TestWorker extends EventEmitter {
  static workerTypeName() {
    return `test-${slugid.v4().replace(/[_-]/g, '').toLowerCase()}-a`;
  }

  constructor(Worker, workerType, workerId) {
    super();

    // This is to avoid the node warning message:
    //    MaxListenersExceededWarning: Possible EventEmitter memory leak
    //    detected. 11 task resolved listeners added. Use
    //    emitter.setMaxListeners() to increase limit
    // During capacity tests
    this.setMaxListeners(30);

    var config = typedEnvConfig({
      files: [`${__dirname}/../config.yml`],
      profile: 'test',
      env: process.env
    });

    this.provisionerId = PROVISIONER_ID;
    this.workerType = workerType || TestWorker.workerTypeName();
    // remove leading underscores because workerId could be used as container name
    // and container names must start with an alphanumeric character.
    this.workerId = workerId || `dummy-worker-${slugid.v4()}`.substring(0, 22);
    this.worker = new Worker(PROVISIONER_ID, this.workerType, this.workerId);

    this.pulse = config.pulse;

    this.queue = new taskcluster.Queue({
      rootUrl: config.rootUrl,
      credentials: config.taskcluster
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
  }

  /**
  Ensure the worker is connected.
  */
  async launch() {
    var proc = await this.worker.launch();

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
    await waitForEvent(this, 'start');
  }

  async terminate() {
    await this.worker.terminate();
    process.stderr.removeAllListeners();
  }

  /**
  Post a single task to the queue.

  @param {String} taskId in slugid.v4 format.
  @param {Object} taskConfig task config overrides (like .payload, etc..)
  */
  async createTask(taskId, taskConfig) {

    taskConfig.schedulerId = 'docker-worker-tests';
    // XXX: This is just a hack really so the validator does not complain.
    taskConfig.taskGroupId = taskId;

    let task = this.TaskFactory.create(taskConfig);
    debug('post to queue %j', task);
    task = await this.queue.createTask(taskId, task);
    this.emit('created task', taskId);
    console.log(`Created Task ID: ${taskId}`);
    return task;
  }

  /**
  Fetch all the common stats used by the tests.
  */
  async fetchTaskStats(task, runId) {
    let taskId = task.taskId;
    let liveLogsLocation = getLogsLocationsFromTask(task).live;

    debug('fetch task stats');
    // Just about every single test needs status of the task...
    var status = await this.queue.status(taskId);
    // Live logging of the task...
    var log = await getArtifact(
      { taskId: taskId, runId: runId }, liveLogsLocation
    );

    // Generally useful for most of the tests...
    var artifacts = await this.queue.listArtifacts(taskId, runId);

    // XXX: Ugh status.status...
    status = status.status;
    var indexedArtifacts =
      artifacts.artifacts.reduce(function(result, artifact) {
        result[artifact.name] = artifact;
        return result;
      }, {});

    return {
      status: status,
      log: log,
      artifacts: indexedArtifacts,

      // Current run useful for .success, etc...
      run: status.runs[runId],

      // Useful if you need to run a secondary queue run, etc...
      taskId: taskId,
      runId: runId
    };
  }

  /**
  * Only listen for task resolved events for the particular task we're working with.
  */
  waitForTaskResolution(taskId) {
    return new Promise(function(accept, reject) {
      this.on('task resolved', (message) => {
        if (message.taskId === taskId) {
          accept(message);
        }
      });
    }.bind(this));
  }

  /**
  Post a message to the queue and wait for the results.

  @param {Object} task partial definition to upload.
  */
  async postToQueue(task, specifiedTaskId) {
    let taskId = specifiedTaskId ? specifiedTaskId : slugid.v4();

    // You might reuse the same task before posting it to the queue, so it might
    // have an already existing taskId.
    delete task['taskId'];

    // Create task and listen for worker to report that the task is resolved.
    // Can no longer rely on pulse messages to indicate that a task is resolved.
    // Tasks resolved by worker shutdown do not publish to task-exception and
    // create a new pending run and publish to task-pending.  Tasks resolved by
    // another entity (canceled tasks) will report to task-exception prior to the worker
    // being finished.
    await Promise.all([
      this.createTask(taskId, task),
      this.waitForTaskResolution(taskId)
    ]);

    var taskStatus = await this.queue.status(taskId);
    // Fetch the final result json.
    var status = taskStatus.status;
    var runId = status.runs.pop().runId;

    // Return uniform stats on the worker run (fetching common useful things).
    task.taskId = taskId;
    return await this.fetchTaskStats(task, runId);
  }
}

module.exports = TestWorker;
