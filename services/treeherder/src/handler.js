import assert from 'assert';
import Debug from 'debug';
import _ from 'lodash';
import slugid from 'slugid';
import taskcluster from 'taskcluster-client';
import parseRoute from './util/route_parser';

let events = new taskcluster.QueueEvents();
let debug = Debug('taskcluster-treeherder:handler');

const TASK_TREEHERDER_SCHEMA = 'http://schemas.taskcluster.net/taskcluster-treeherder/v1/task-treeherder-config.json#';
const EVENT_MAP = {
  [events.taskPending().exchange]: 'pending',
  [events.taskRunning().exchange]: 'running',
  [events.taskCompleted().exchange]: 'completed',
  [events.taskFailed().exchange]: 'failed',
  [events.taskException().exchange]: 'exception'
};

function stateFromRun(run) {
  switch (run.state) {
    case 'exception':
    case 'failed':
      return 'completed';
    default:
      return run.state;
  }
}

function resultFromRun(run) {
  switch (run.state) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'fail';
    case 'exception':
      if (run.reasonResolved === 'canceled') {
        return 'canceled';
      }

      return 'exception';
    default:
      return 'unknown';
  }
}

// Creates a log entry for Treeherder to retrieve and parse.  This log is
// displayed on the Treeherder Log Viewer once parsed.
function createLogReference(queue, taskId, run) {
  let logUrl = queue.buildUrl(
    queue.getArtifact, taskId, run.runId, 'public/logs/live_backing.log'
  );

  return {
    // XXX: This is a magical name see 1147958 which enables the log viewer.
    name: 'builds-4h',
    url: logUrl
  };
}

// Filters the task routes for the treeherder specific route.  Once found,
// the route is parsed into distinct parts used for constructing the
// Treeherder job message.
function parseRouteInfo(prefix, taskId, routes, task) {
  let matchingRoutes = routes.filter((r) => {
    return r.split('.')[0] === prefix;
  });

  if (matchingRoutes.length != 1) {
    throw new Error(
      `Could not determine treeherder route.  Either there is no route, ` +
      `or more than one matching route exists.  Task ID: ${taskId} Routes: ${routes}`
    );
  }

  let parsedRoute = parseRoute(matchingRoutes[0]);
  // During a transition period, some tasks might contain a revision within
  // the task definition that should override the revision in the routing key.
  let revision = _.get(task, 'extra.treeherder.revision');

  if (revision) {
    parsedRoute.revision = revision;
  }

  return parsedRoute;
}


function validateTask(validate, taskId, task, schema) {
    if (!task.extra || !task.extra.treeherder) {
      throw new Error(`Message is missing Treeherder job configuration. Task ID: ${taskId}`);
    }
    let validationErrors = validate(task.extra.treeherder, schema);
    if (validationErrors) {
      throw new Error(`Message contains an invalid Treeherder job configuration. Task ID: ${taskId} ${validationErrors}`);
    }
}

export class Handler {
  constructor(options) {
    this.queue = options.queue;
    this.scheduler = options.scheduler;
    this.listener = options.listener;
    this.prefix = options.prefix;
    this.publisher = options.publisher;
    this.validator = options.validator;
    this.monitor = options.monitor;
  }

  // Starts up the message handler and listens for messages
  async start() {
    debug('Starting handler');
    this.listener.on('message', async (message) => {
      try {
        this.monitor.timer('handle-message.time', this.handleMessage(message));
        this.monitor.timer('handle-message.success');
      } catch(err) {
        this.monitor.timer('handle-message.failure');
        console.log(`Error caught when processing message. ${err.message}. ${err.stack}`);
      };
    });
    await this.listener.resume();
    debug('Handler Started');
  }

  // Listens for Task event messages and invokes the appropriate handler
  // for the type of message received.
  //
  // Only messages that contain the properly formatted routing key and contains
  // treeherder job information in task.extra.treeherder are accepted
  async handleMessage(message) {
    this.monitor.count('handle-message');
    let taskId = message.payload.status.taskId;
    let task = await this.queue.task(taskId);
    let parsedRoute = parseRouteInfo(this.prefix, taskId, message.routes, task);
    debug(`message received for task ${taskId} with route ${message.routes}`);
    this.monitor.count(`${parsedRoute.project}.handle-message`);

    validateTask(this.validator, taskId, task, TASK_TREEHERDER_SCHEMA);

    switch (EVENT_MAP[message.exchange]) {
      case 'pending':
        let runId = message.payload.runId;
        let run = message.payload.status.runs[message.payload.runId];
        // If the task run was created for an infrastructure rerun, then resolve
        // the previous run as retried.
        if (runId > 0) {
          await this.handleTaskRerun(parsedRoute, task, message.payload);
        }

        return await this.handleTaskPending(parsedRoute, task, message.payload)
      case 'running':
        return await this.handleTaskRunning(parsedRoute, task, message.payload)
      case 'completed':
        return await this.handleTaskCompleted(parsedRoute, task, message.payload)
      case 'failed':
        return await this.handleTaskFailed(parsedRoute, task, message.payload)
      case 'exception':
        return await this.handleTaskException(parsedRoute, task, message.payload)
      default:
        throw new Error(`Unknown exchange: ${message.exchange}`);
    }

  }

  // Publishes the Treeherder job message to pulse.
  async publishJobMessage(pushInfo, job, taskId) {
    try {
      console.log(`Publishing message for ${pushInfo.project} with task ID ${taskId}`);
      await this.publisher.jobs(job, {project:pushInfo.project, destination: pushInfo.destination});
      console.log(`Published message for ${pushInfo.project} with task ID ${taskId}`);
      this.monitor.count(`${pushInfo.project}.publish-message.success`);
    } catch(err) {
      this.monitor.count(`${pushInfo.project}.publish-message.failure`);
      throw new Error(
        `Could not publish job message for ${pushInfo.project} with task ID ${taskId}. ${err.message}. \n` +
        `Job: ${JSON.stringify(job, null, 4)}`);
    }
  }

  // Builds the basic Treeherder job message that's universal for all
  // messsage types.
  //
  // Specific handlers for each message type will add/remove information necessary
  // for the type of task event..
  buildMessage(pushInfo, task, runId, message) {
    let taskId = message.status.taskId;
    let run = message.status.runs[runId];
    let treeherderConfig = task.extra.treeherder;
    let job = {
      owner: task.metadata.owner,
      taskId: `${slugid.decode(taskId)}/${runId}`,
      retryId: runId,
      isRetried: false,
      display: {
        // jobSymbols could be an integer (i.e. Chunk ID) but need to be strings
        // for treeherder
        jobSymbol: String(treeherderConfig.symbol),
        groupSymbol: treeherderConfig.groupSymbol || '?',
        // Maximum job name length is 100 chars...
        jobName: task.metadata.name.slice(0, 99),
      },
      state: stateFromRun(run),
      result: resultFromRun(run),
      tier: treeherderConfig.tier || 1,
      timeScheduled: task.created,
      // TODO: add coalesced info
      jobKind: treeherderConfig.jobKind ? treeherderConfig.jobKind : 'other',
      reason: treeherderConfig.reason || "scheduled",
      jobInfo: {
        summary: task.metadata.description,
        links: [
          {
            label: 'Inspect Task',
            linkText: 'Inspect Task',
            url: `https:\/\/tools.taskcluster.net/task-inspector/#${taskId}/${runId}`
          }
        ]
      }
    };

    job.origin = {
        kind: pushInfo.origin,
        project: pushInfo.project
    };

    if (pushInfo.revision) {
      job.origin.revision = pushInfo.revision;
    } else {
      job.origin.revision_hash = pushInfo.revision_hash;
    }

    if (pushInfo.origin === 'hg.mozilla.org') {
      job.origin.pushLogID = pushInfo.pushId;
    } else {
      job.origin.pullRequestID = pushInfo.pushId;
      job.origin.owner = pushInfo.owner;
    }

    // Transform "collection" into an array of labels if task doesn't
    // define "labels".
    let labels = treeherderConfig.labels ? treeherderConfig.labels : [];
    if (!labels.length) {
      if (!treeherderConfig.collection) {
        labels = ['opt'];
      } else {
        labels = Object.keys(treeherderConfig.collection);
      }
    }

    job.labels = labels;

    let machine = treeherderConfig.machine || {};
    job.buildMachine = {
        name: run.workerId || 'unknown',
        platform: machine.platform || task.workerType,
        os: machine.os || "-",
        architecture: machine.architecture || "-"
    };

    if (treeherderConfig.productName) {
      job.productName = treeherderConfig.productName;
    }

    if (treeherderConfig.groupName) {
      job.display.groupName = treeherderConfig.groupName;
    }

    return job;
  }

  async handleTaskPending(pushInfo, task, message) {
    let job = this.buildMessage(pushInfo, task, message.runId, message);
    await this.publishJobMessage(pushInfo, job, message.status.taskId);
  }

  async handleTaskRerun(pushInfo, task, message) {
    let run = message.status.runs[message.runId-1];
    let job = this.buildMessage(pushInfo, task, message.runId-1, message);
    job.state = 'completed';
    job.result = 'fail';
    job.isRetried = true;
    job.logs = [createLogReference(this.queue, message.status.taskId, run)];
    await this.publishJobMessage(pushInfo, job, message.status.taskId);
  }

  async handleTaskRunning(pushInfo, task, message) {
    let run = message.status.runs[message.runId];
    let job = this.buildMessage(pushInfo, task, message.runId, message);
    job.timeStarted = message.status.runs[message.runId].started;
    job.logs = [createLogReference(this.queue, message.status.taskId, run)];
    await this.publishJobMessage(pushInfo, job, message.status.taskId);
  }

  async handleTaskCompleted(pushInfo, task, message) {
    let run = message.status.runs[message.runId];
    let job = this.buildMessage(pushInfo, task, message.runId, message);

    job.timeStarted = run.started;
    job.timeCompleted = run.resolved;
    job.logs = [createLogReference(this.queue, message.status.taskId, run)];
    await this.publishJobMessage(pushInfo, job, message.status.taskId);
  }

  async handleTaskFailed(pushInfo, task, message) {
    // To correctly handle the rerun case we must not mark jobs which will be
    // marked as retry as 'completed'. This means we must determine if this run
    // will trigger a retry by querying the scheduler.
    if (
      task.schedulerId === 'task-graph-scheduler' &&
      task.taskGroupId
    ) {
      try {
        let taskInfo = await this.scheduler.inspectTask(task.taskGroupId, taskId);
        if (taskInfo.reruns > payload.runId) {
          // Simply allow the rerun handle to update the task...
          return;
        }
      } catch(e) {
        debug(
          `Could not retrieve task graph information for ${task.taskGroupId}, ` +
          `assuming task is part of a task group not scheduled through task-graph-scheduler.`
        );
      }
    }

    let run = message.status.runs[message.runId];
    let job = this.buildMessage(pushInfo, task, message.runId, message);
    job.timeStarted = run.started;
    job.timeCompleted = run.resolved;
    job.logs = [createLogReference(this.queue, message.status.taskId, run)];
    await this.publishJobMessage(pushInfo, job, message.status.taskId);
  }

  async handleTaskException(pushInfo, task, message) {
    let run = message.status.runs[message.runId];
    // Do not report runs that were created as an exception.  Such cases
    // are deadline-exceeded
    if (run.reasonCreated === 'exception') {
      return;
    }

    let job = this.buildMessage(pushInfo, task, message.runId, message);
    job.timeStarted = run.started;
    job.timeCompleted = run.resolved;
    job.logs = [createLogReference(this.queue, message.status.taskId, run)];
    await this.publishJobMessage(pushInfo, job, message.status.taskId);
  }
}
