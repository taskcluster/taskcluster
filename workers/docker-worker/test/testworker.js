/**
 * This module spawns an instance of the worker, then submits a given task for
 * this automatically generated workerType and listens for the task completion
 * event.
 */
import devnull from 'dev-null';
import slugid from 'slugid';
import request from 'superagent-promise';
import Debug from 'debug';
import waitForEvent from '../build/lib/wait_for_event';
import split from 'split2';
import getArtifact from './integration/helper/get_artifact';
import Task from 'taskcluster-task-factory/task';
import Graph from 'taskcluster-task-factory/graph';
import LocalWorker from './localworker';
import taskcluster from 'taskcluster-client';
import base from 'taskcluster-base';
import Promise from 'promise';
import {EventEmitter} from 'events';
import getLogsLocationsFromTask from '../build/lib/features/logs_location.js';

let queueEvents = new taskcluster.QueueEvents();
let schedulerEvents = new taskcluster.SchedulerEvents();
let debug = Debug('docker-worker:test:testworker');

/** Test provisioner id, don't change this... */
const PROVISIONER_ID = 'no-provisioning-nope';

const DEFAULT_WORKER_PREFIX = 'dummy-worker';

export default class TestWorker extends EventEmitter {
  constructor(Worker, workerType, workerId) {
    super();
    var config = base.config({
      files: [`${__dirname}/../config.yml`],
      profile: 'test',
      env: process.env
    });

    this.provisionerId = PROVISIONER_ID;
    // Use worker_test_ prefix so ci worker scopes can be more restrictive for
    // claiming/creating work
    this.workerType = workerType || `dummy-type-${slugid.v4()}`.substring(0, 22);
    // remove leading underscores because workerId could be used as container name
    // and container names must start with an alphanumeric character.
    this.workerId = workerId || `dummy-worker-${slugid.v4()}`.substring(0, 22);
    this.worker = new Worker(PROVISIONER_ID, this.workerType, this.workerId);

    this.pulse = config.pulse;

    this.queue = new taskcluster.Queue({
      credentials: config.taskcluster
    });

    this.scheduler = new taskcluster.Scheduler({
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
  Post a task to the graph with the testing configuration.

  @param {String} graphId task graph id.
  @param {Object} graphConfig for the graph..
  */
  async createGraph(graphId, graphConfig) {
    var graph = Graph.create(graphConfig);
    graph.tasks.map(function(graphTask) {
      graphTask.task.schedulerId = 'task-graph-scheduler';
      graphTask.task.workerType = this.workerType;
      graphTask.task.provisionerId = this.provisionerId;
      graphTask.task.taskGroupId = graphId;
      return graphTask;
    }, this);

    debug('post to graph %j', graph);
    return await this.scheduler.createTaskGraph(graphId, graph);
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
    var status = status.status;
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

  async postToScheduler(graphId, graph) {
    // Create and bind the listener which will notify us when the worker
    // completes a task.
    var listener = new taskcluster.PulseListener({
      credentials: this.pulse
    });

    // Listen for either blocked or finished...
    await listener.bind(schedulerEvents.taskGraphBlocked({
      taskGraphId: graphId
    }));

    await listener.bind(schedulerEvents.taskGraphFinished({
      taskGraphId: graphId
    }));

    // Connect to queue and being consuming it...
    await listener.connect();
    await listener.resume();

    // Begin listening at the same time we create the task to ensure we get the
    // message at the correct time.
    var creation = await Promise.all([
      waitForEvent(listener, 'message'),
      this.createGraph(graphId, graph),
    ]);

    // Fetch the final result json.
    var status = creation.shift().payload.status;

    // Close listener we only care about one message at a time.
    try {
      await listener.close();
    } catch(e) {
      console.log('error during close:', e);
    }

    var graph = await this.scheduler.inspect(graphId);
    return await Promise.all(graph.tasks.map(async (task) => {
      // Note: that we assume runId 0 here which is fine locally since we know
      // the number of runs but not safe is we wanted to test reruns.
      return await this.fetchTaskStats(task, 0);
    }));
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
    var creation = await Promise.all([
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
