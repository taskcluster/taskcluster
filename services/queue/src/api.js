let assert = require('assert');
let _ = require('lodash');
let APIBuilder = require('taskcluster-lib-api');
let Entity = require('azure-entities');
let taskCreds = require('./task-creds');

// Maximum number runs allowed
const MAX_RUNS_ALLOWED = 50;
// Priority levels in order from high to low
const PRIORITY_LEVELS = [
  'highest',
  'very-high',
  'high',
  'medium',
  'low',
  'very-low',
  'lowest',
];

/**
 * **Azure Queue Invariants**
 *
 * We use azure queue storage queues for 3 purposes:
 *   A) distribution of tasks to workers,
 *   B) expiration of task-claims, and
 *   C) resolution by deadline expiration.
 *
 * Messages for the purposes of (A) are stored on queues specific the
 * _provisionerId_ and _workerType_ of the tasks. All messages in azure queues
 * are advisory. Meaning that duplicating them, or forgetting to delete them and
 * handling them twice shall not cause issues.
 *
 * That said we do need a few invariants, this comment doesn't attempt to
 * formally establish correctness. Instead we just seek to explain the
 * intuition, so others have a chance and understanding what is going on.
 *
 *  i)    For any `pending` task there is at least one message with payload
 *        `{taskId, runId}` in a _workerType_ specific queue.
 *
 *  ii)   For any `running` task there is at least one message with payload
 *        `{taskId, runId, takenUntil}` in the queue for claim expiration,
 *        such that the message becomes visible after the claim on the
 *        current run has expired.
 *
 *  iii)  For any unresolved task there is at least one message with payload
 *        `{taskId, deadline}` in the queue for deadline resolution, such that
 *        the message becomes visible after the tasks deadline has expired.
 *
 * Using invariants above it's easy to ensure (A), (B) and (C), so long as we
 * always remember that a message is only advisory. Hence, if the task mentioned
 * doesn't exist, or is already resolved, then no error is reported and no
 * action is taken.
 *
 * To avoid the case, where we ignore the only message during expiration of
 * claims (B) due to server clock drift, we shall put the `takenUntil` time
 * into the message, so we just check if it has been updated to see if the
 * message is recent. We shall employ the same trick to ensure that clock drift
 * can't cause the last deadline message to get ignored either.
 */

// Common patterns URL parameters
let SLUGID_PATTERN = /^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$/;
let GENERIC_ID_PATTERN = /^[a-zA-Z0-9-_]{1,38}$/;
let RUN_ID_PATTERN = /^[1-9]*[0-9]+$/;

/** API end-point for version v1/ */
let builder = new APIBuilder({
  title: 'Queue API Documentation',
  description: [
    'The queue service is responsible for accepting tasks and track their state',
    'as they are executed by workers. In order ensure they are eventually',
    'resolved.',
    '',
    'This document describes the API end-points offered by the queue. These ',
    'end-points targets the following audience:',
    ' * Schedulers, who create tasks to be executed,',
    ' * Workers, who execute tasks, and',
    ' * Tools, that wants to inspect the state of a task.',
  ].join('\n'),
  serviceName: 'queue',
  apiVersion: 'v1',
  params: {
    taskId: SLUGID_PATTERN,
    taskGroupId: SLUGID_PATTERN,
    provisionerId: GENERIC_ID_PATTERN,
    workerType: GENERIC_ID_PATTERN,
    workerGroup: GENERIC_ID_PATTERN,
    workerId: GENERIC_ID_PATTERN,
    runId: RUN_ID_PATTERN,
    name: /^[\x20-\x7e]+$/, // Artifact names must be printable ASCII
  },
  context: [
    'Task', // data.Task instance
    'Artifact', // data.Artifact instance
    'TaskGroup', // data.TaskGroup instance
    'taskGroupExpiresExtension', // Time delay before expiring a task-group
    'TaskGroupMember', // data.TaskGroupMember instance
    'TaskGroupActiveSet', // data.TaskGroupMember instance (but in a different table)
    'TaskDependency', // data.TaskDependency instance
    'Provisioner', // data.Provisioner instance
    'WorkerType', // data.WorkerType instance
    'Worker', // data.Worker instance
    'publicBucket', // bucket instance for public artifacts
    'privateBucket', // bucket instance for private artifacts
    'blobStore', // BlobStore for azure artifacts
    'publisher', // publisher from base.Exchanges
    'claimTimeout', // Number of seconds before a claim expires
    'queueService', // Azure QueueService object from queueservice.js
    'regionResolver', // Instance of EC2RegionResolver,
    'credentials', // TC credentials for issuing temp creds on claim
    'dependencyTracker', // Instance of DependencyTracker
    'monitor', // base.monitor instance
    'workClaimer', // Instance of WorkClaimer
    'workerInfo', // Instance of WorkerInfo
    's3Controller', // Instance of remotely-signed-s3.Controller
    's3Runner', // Instance of remotely-signed-s3.Runner
    'useCloudMirror', // If true, use the cloud-mirror service
    'cloudMirrorHost', // Hostname of the cloud-mirror service
    'artifactRegion', // Region where artifacts are stored (no cloud-mirror)
    'blobRegion', // Region where blobs are stored (no cloud-mirror)
    'publicBlobBucket', // Bucket containing public blobs
    'privateBlobBucket', // Bucket containing private blobs
  ],
});

// Export builder
module.exports = builder;

/** Get task */
builder.declare({
  method: 'get',
  route: '/task/:taskId',
  name: 'task',
  stability: APIBuilder.stability.stable,
  category: 'Queue Service',
  idempotent: true,
  output: 'task.yml',
  title: 'Get Task Definition',
  description: [
    'This end-point will return the task-definition. Notice that the task',
    'definition may have been modified by queue, if an optional property is',
    'not specified the queue may provide a default value.',
  ].join('\n'),
}, async function(req, res) {
  // Load Task entity
  let task = await this.Task.load({
    taskId: req.params.taskId,
  }, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound', [
      '`{{taskId}}` does not correspond to a task that exists.',
      'Are you sure this task has already been submitted?',
    ].join('\n'), {
      taskId: req.params.taskId,
    });
  }

  // Create task definition
  let definition = await task.definition();

  return res.reply(definition);
});

/** Get task status */
builder.declare({
  method: 'get',
  route: '/task/:taskId/status',
  name: 'status',
  stability: APIBuilder.stability.stable,
  input: undefined, // No input is accepted
  output: 'task-status-response.yml',
  category: 'Queue Service',
  title: 'Get task status',
  description: [
    'Get task status structure from `taskId`',
  ].join('\n'),
}, async function(req, res) {
  // Load Task entity
  let task = await this.Task.load({
    taskId: req.params.taskId,
  }, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound', [
      '`{{taskId}}` does not correspond to a task that exists.',
      'Are you sure this task exists?',
    ].join('\n'), {
      taskId: req.params.taskId,
    });
  }

  // Reply with task status
  return res.reply({
    status: task.status(),
  });
});

/** List taskIds by taskGroupId */
builder.declare({
  method: 'get',
  route: '/task-group/:taskGroupId/list',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  name: 'listTaskGroup',
  stability: APIBuilder.stability.stable,
  category: 'Queue Service',
  output: 'list-task-group-response.yml',
  title: 'List Task Group',
  description: [
    'List tasks sharing the same `taskGroupId`.',
    '',
    'As a task-group may contain an unbounded number of tasks, this end-point',
    'may return a `continuationToken`. To continue listing tasks you must call',
    'the `listTaskGroup` again with the `continuationToken` as the',
    'query-string option `continuationToken`.',
    '',
    'By default this end-point will try to return up to 1000 members in one',
    'request. But it **may return less**, even if more tasks are available.',
    'It may also return a `continuationToken` even though there are no more',
    'results. However, you can only be sure to have seen all results if you',
    'keep calling `listTaskGroup` with the last `continuationToken` until you',
    'get a result without a `continuationToken`.',
    '',
    'If you are not interested in listing all the members at once, you may',
    'use the query-string option `limit` to return fewer.',
  ].join('\n'),
}, async function(req, res) {
  let taskGroupId = req.params.taskGroupId;
  let continuation = req.query.continuationToken || null;
  let limit = parseInt(req.query.limit || 1000, 10);

  // Find taskGroup and list of members
  let [
    taskGroup,
    members,
  ] = await Promise.all([
    this.TaskGroup.load({taskGroupId}, true),
    this.TaskGroupMember.query({
      taskGroupId,
      expires: Entity.op.greaterThanOrEqual(new Date()),
    }, {continuation, limit}),
  ]);

  // If no taskGroup was found
  if (!taskGroup) {
    return res.reportError('ResourceNotFound',
      'No task-group with taskGroupId: `{{taskGroupId}}`', {
        taskGroupId,
      },
    );
  }

  /* eslint-disable no-extra-parens */
  // Load tasks
  let tasks = (await Promise.all(members.entries.map(member => {
    return this.Task.load({taskId: member.taskId}, true);
  }))).filter(task => {
    // Remove tasks that don't exist, this happens on creation errors
    // Remove tasks with wrong schedulerId, this shouldn't happen unless of some
    // creation errors (probably something that involves dependency errors).
    return task && task.schedulerId === taskGroup.schedulerId;
  });
  /* eslint-enable no-extra-parens */

  // Build result
  let result = {
    taskGroupId,
    tasks: await Promise.all(tasks.map(async (task) => {
      return {
        status: task.status(),
        task: await task.definition(),
      };
    })),
  };
  if (members.continuation) {
    result.continuationToken = members.continuation;
  }

  return res.reply(result);
});

/** List tasks dependents */
builder.declare({
  method: 'get',
  route: '/task/:taskId/dependents',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  name: 'listDependentTasks',
  category: 'Queue Service',
  stability: APIBuilder.stability.stable,
  output: 'list-dependent-tasks-response.yml',
  title: 'List Dependent Tasks',
  description: [
    'List tasks that depend on the given `taskId`.',
    '',
    'As many tasks from different task-groups may dependent on a single tasks,',
    'this end-point may return a `continuationToken`. To continue listing',
    'tasks you must call `listDependentTasks` again with the',
    '`continuationToken` as the query-string option `continuationToken`.',
    '',
    'By default this end-point will try to return up to 1000 tasks in one',
    'request. But it **may return less**, even if more tasks are available.',
    'It may also return a `continuationToken` even though there are no more',
    'results. However, you can only be sure to have seen all results if you',
    'keep calling `listDependentTasks` with the last `continuationToken` until',
    'you get a result without a `continuationToken`.',
    '',
    'If you are not interested in listing all the tasks at once, you may',
    'use the query-string option `limit` to return fewer.',
  ].join('\n'),
}, async function(req, res) {
  let taskId = req.params.taskId;
  let continuation = req.query.continuationToken || null;
  let limit = parseInt(req.query.limit || 1000, 10);

  // Find task and list dependents
  let [
    task,
    dependents,
  ] = await Promise.all([
    this.Task.load({taskId}, true),
    this.TaskDependency.query({
      taskId,
      expires: Entity.op.greaterThanOrEqual(new Date()),
    }, {continuation, limit}),
  ]);

  // Check if task exists
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'Task with taskId: `{{taskId}}` was not found',
      {taskId},
    );
  }

  /* eslint-disable no-extra-parens */
  // Load tasks
  let tasks = (await Promise.all(dependents.entries.map(dependent => {
    return this.Task.load({taskId: dependent.dependentTaskId}, true);
  }))).filter(task => !!task);
  /* eslint-enable no-extra-parens */

  // Build result
  let result = {
    taskId,
    tasks: await Promise.all(tasks.map(async (task) => {
      return {
        status: task.status(),
        task: await task.definition(),
      };
    })),
  };
  if (dependents.continuation) {
    result.continuationToken = dependents.continuation;
  }

  return res.reply(result);
});

/**
 * Generate the list of acceptable priorities for a task with this priority
 */
const authorizeTaskCreation = async function(req, taskId, taskDef) {
  const priority = taskDef.priority === 'normal' ? 'lowest' : taskDef.priority;
  const priorities = PRIORITY_LEVELS.slice(0, PRIORITY_LEVELS.indexOf(priority) + 1);
  assert(priorities.length > 0, 'must have a non-empty list of priorities');

  await req.authorize({
    legacyScopes: priority === 'lowest',
    taskId,
    priorities,
    routes: taskDef.routes,
    scopes: taskDef.scopes,
    schedulerId: taskDef.schedulerId,
    taskGroupId: taskDef.taskGroupId || taskId,
    provisionerId: taskDef.provisionerId,
    workerType: taskDef.workerType,
  });
};

/** Construct default values and validate dates */
let patchAndValidateTaskDef = function(taskId, taskDef) {
  // Set taskGroupId to taskId if not provided
  if (!taskDef.taskGroupId) {
    taskDef.taskGroupId = taskId;
  }

  // Ensure: created < now < deadline (with drift up to 15 min)
  let created = new Date(taskDef.created);
  let deadline = new Date(taskDef.deadline);
  if (created.getTime() < new Date().getTime() - 15 * 60 * 1000) {
    return {
      code: 'InputError',
      message: 'Created timestamp cannot be in the past (max 15min drift)',
      details: {created: taskDef.created},
    };
  }
  if (created.getTime() > new Date().getTime() + 15 * 60 * 1000) {
    return {
      code: 'InputError',
      message: 'Created timestamp cannot be in the future (max 15min drift)',
      details: {created: taskDef.created},
    };
  }
  if (created.getTime() > deadline.getTime()) {
    return {
      code: 'InputError',
      message: 'Deadline cannot be past created',
      details: {created: taskDef.created, deadline: taskDef.deadline},
    };
  }
  if (deadline.getTime() < new Date().getTime()) {
    return {
      code: 'InputError',
      message: 'Deadline cannot be in the past',
      details: {deadline: taskDef.deadline},
    };
  }

  let msToDeadline = deadline.getTime() - new Date().getTime();
  // Validate that deadline is less than 5 days from now, allow 15 min drift
  if (msToDeadline > 5 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000) {
    return {
      code: 'InputError',
      message: 'Deadline cannot be more than 5 days into the future',
      details: {deadline: taskDef.deadline},
    };
  }

  // Set expires, if not defined
  if (!taskDef.expires) {
    let expires = new Date(taskDef.deadline);
    expires.setFullYear(expires.getFullYear() + 1);
    taskDef.expires = expires.toJSON();
  }

  // Validate that expires is past deadline
  if (deadline.getTime() > new Date(taskDef.expires).getTime()) {
    return {
      code: 'InputError',
      message: 'Expires cannot be before the deadline',
      details: {deadline: taskDef.deadline, expires: taskDef.expires},
    };
  }

  // Ensure that date formats are encoded as we store them for idempotent
  // operations to work with date format that has more or fewer digits
  taskDef.created = new Date(taskDef.created).toJSON();
  taskDef.deadline = new Date(taskDef.deadline).toJSON();
  taskDef.expires = new Date(taskDef.expires).toJSON();

  // Migrate normal -> lowest, as it is the new default
  if (taskDef.priority === 'normal') {
    taskDef.priority = 'lowest';
  }

  return null;
};

/** Ensure the taskGroup exists and that membership is declared */
let ensureTaskGroup = async (ctx, taskId, taskDef, res) => {
  let taskGroupId = taskDef.taskGroupId;
  let taskGroup = await ctx.TaskGroup.load({taskGroupId}, true);
  let expires = new Date(taskDef.expires);
  let taskGroupExpiration = new Date(
    expires.getTime() + ctx.taskGroupExpiresExtension * 1000
  );
  if (!taskGroup) {
    taskGroup = await ctx.TaskGroup.create({
      taskGroupId,
      schedulerId: taskDef.schedulerId,
      expires: taskGroupExpiration,
    }).catch(err => {
      // We only handle cases where the entity already exists
      if (!err || err.code !== 'EntityAlreadyExists') {
        throw err;
      }
      return ctx.TaskGroup.load({taskGroupId});
    });
  }
  if (taskGroup.schedulerId !== taskDef.schedulerId) {
    res.reportError(
      'RequestConflict', [
        'Task group `{{taskGroupId}}` contains tasks with',
        'schedulerId `{{taskGroupSchedulerId}}`. You are attempting',
        'to include tasks from schedulerId `{{taskSchedulerId}}`,',
        'which is not permitted.',
        'All tasks in the same task-group must have the same schedulerId.',
      ].join('\n'), {
        taskGroupId,
        taskGroupSchedulerId: taskGroup.schedulerId,
        taskSchedulerId: taskDef.schedulerId,
      });
    return false;
  }
  // Update taskGroup.expires if necessary
  await taskGroup.modify(taskGroup => {
    if (taskGroup.expires.getTime() < expires.getTime()) {
      taskGroup.expires = taskGroupExpiration;
    }
  });

  // Ensure the group membership relation is constructed too
  await ctx.TaskGroupMember.create({
    taskGroupId,
    taskId,
    expires,
  }).catch(err => {
    // If the entity already exists, then we're happy no need to crash
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }
  });

  // Now we also add the task to the group size counters as well
  await ctx.TaskGroupActiveSet.create({
    taskGroupId,
    taskId,
    expires,
  }).catch(async (err) => {
    // If the entity already exists, then we're happy no need to crash
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }

    let active = await ctx.TaskGroupActiveSet.load({taskId, taskGroupId});

    if (!_.isEqual(new Date(active.expires), expires)) {
      return res.reportError('RequestConflict', [
        'taskId `{{taskId}}` already used by another task.',
        'This could be the result of faulty idempotency!',
      ].join('\n'), {
        taskId,
      });
    }
  });

  return true;
};

/** Create tasks */
/** Define tasks */
/** Schedule previously defined tasks */
/** Rerun a previously resolved task */
/** Cancel a task */
/** Poll for a task */
// Hack to get promises that resolve after 20s without creating a setTimeout
// for each, instead we create a new promise every 2s and reuse that.
let _lastTime = 0;
let _sleeping = null;
let sleep20Seconds = () => {
  let time = Date.now();
  if (!_sleeping || time - _lastTime > 2000) {
    _sleeping = new Promise(accept => setTimeout(accept, 20 * 1000));
  }
  return _sleeping;
};

/** Claim any task */
/** Claim a task */
/** Reclaim a task */
/**
 * Resolve a run of a task as `target` ('completed' or 'failed').
 * This function assumes the same context as the API.
 */
let resolveTask = async function(req, res, taskId, runId, target) {
  assert(target === 'completed' ||
         target === 'failed', 'Expected a valid target');

  // Load Task entity
  let task = await this.Task.load({taskId}, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound',
      'Task `{{taskId}}` not found. Are you sure it was created?', {
        taskId,
      },
    );
  }

  // Handle cases where the run doesn't exist
  let run = task.runs[runId];
  if (!run) {
    return res.reportError('ResourceNotFound',
      'Run {{runId}} not found on task `{{taskId}}`.', {
        taskId,
        runId,
      },
    );
  }

  await req.authorize({
    taskId,
    runId,
    workerGroup: run.workerGroup,
    workerId: run.workerId,
  });

  // Ensure that all blob artifacts which were created are present before
  // allowing resolution as 'completed'
  if (target === 'completed') {
    let haveAllBlobs = true;
    await this.Artifact.query({
      taskId,
      runId,
      storageType: 'blob',
      present: false,
    }, {
      limit: 1,
      handler: () => { haveAllBlobs = false; },
    });

    if (!haveAllBlobs) {
      return res.reportError('RequestConflict',
        'All blob artifacts must be present to resolve task as completed');
    }
  }

  await task.modify((task) => {
    let run = task.runs[runId];

    // No modification if run isn't running or the run isn't last
    if (task.runs.length - 1 !== runId || run.state !== 'running') {
      return;
    }

    // Update run
    run.state = target; // completed or failed
    run.reasonResolved = target; // completed or failed
    run.resolved = new Date().toJSON();

    // Clear takenUntil on task
    task.takenUntil = new Date(0);
  });
  // Find the run that we (may) have modified
  run = task.runs[runId];

  // If run isn't resolved to target, we had a conflict
  if (task.runs.length - 1 !== runId ||
      run.state !== target ||
      run.reasonResolved !== target) {
    return res.reportError('RequestConflict',
      'Run {{runId}} on task `{{taskId}}` is resolved or not running.', {
        taskId,
        runId,
      },
    );
  }

  // Update dependency tracker
  await this.queueService.putResolvedMessage(
    taskId,
    task.taskGroupId,
    task.schedulerId,
    target
  );

  // Construct status object
  let status = task.status();
  let taskPulseContents = {
    tags: task.tags,
  };
  // Post message about task resolution
  if (target === 'completed') {
    await this.publisher.taskCompleted({
      status,
      runId,
      task: taskPulseContents,
      workerGroup: run.workerGroup,
      workerId: run.workerId,
    }, task.routes);
    this.monitor.log.taskCompleted({taskId, runId});
  } else {
    await this.publisher.taskFailed({
      status,
      runId,
      task: taskPulseContents,
      workerGroup: run.workerGroup,
      workerId: run.workerId,
    }, task.routes);
    this.monitor.log.taskFailed({taskId, runId});
  }

  return res.reply({status});
};

/** Report task completed */
/** Report task failed */
/** Report task exception */
// Load artifacts.js so API end-points declared in that file is loaded
require('./artifacts');

/** Get all active provisioners */
builder.declare({
  method: 'get',
  route: '/provisioners',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  name: 'listProvisioners',
  category: 'Queue Service',
  stability: APIBuilder.stability.experimental,
  output: 'list-provisioners-response.yml',
  title: 'Get a list of all active provisioners',
  description: [
    'Get all active provisioners.',
    '',
    'The term "provisioner" is taken broadly to mean anything with a provisionerId.',
    'This does not necessarily mean there is an associated service performing any',
    'provisioning activity.',
    '',
    'The response is paged. If this end-point returns a `continuationToken`, you',
    'should call the end-point again with the `continuationToken` as a query-string',
    'option. By default this end-point will list up to 1000 provisioners in a single',
    'page. You may limit this with the query-string parameter `limit`.',
  ].join('\n'),
}, async function(req, res) {
  const continuation = req.query.continuationToken || null;
  const limit = Math.min(1000, parseInt(req.query.limit || 1000, 10));

  const provisioners = await this.Provisioner.scan({}, {continuation, limit});
  const result = {
    provisioners: provisioners.entries.map(provisioner => provisioner.json()),
  };

  if (provisioners.continuation) {
    result.continuationToken = provisioners.continuation;
  }

  return res.reply(result);
});

/** Get a provisioner */
builder.declare({
  method: 'get',
  route: '/provisioners/:provisionerId',
  name: 'getProvisioner',
  stability: APIBuilder.stability.experimental,
  output: 'provisioner-response.yml',
  category: 'Queue Service',
  title: 'Get an active provisioner',
  description: [
    'Get an active provisioner.',
    '',
    'The term "provisioner" is taken broadly to mean anything with a provisionerId.',
    'This does not necessarily mean there is an associated service performing any',
    'provisioning activity.',
  ].join('\n'),
}, async function(req, res) {
  const provisionerId = req.params.provisionerId;

  const provisioner = await this.Provisioner.load({
    provisionerId,
    expires: Entity.op.greaterThan(new Date()),
  }, true);

  if (!provisioner) {
    return res.reportError('ResourceNotFound',
      'Provisioner `{{provisionerId}}` not found. Are you sure it was created?', {
        provisionerId,
      },
    );
  }

  return res.reply(provisioner.json());
});

/** Update a provisioner */
builder.declare({
  method: 'put',
  route: '/provisioners/:provisionerId',
  name: 'declareProvisioner',
  stability: APIBuilder.stability.experimental,
  category: 'Queue Service',
  scopes: {AllOf: [{
    for: 'property',
    in: 'properties',
    each: 'queue:declare-provisioner:<provisionerId>#<property>',
  }]},
  output: 'provisioner-response.yml',
  input: 'update-provisioner-request.yml',
  title: 'Update a provisioner',
  description: [
    'Declare a provisioner, supplying some details about it.',
    '',
    '`declareProvisioner` allows updating one or more properties of a provisioner as long as the required scopes are',
    'possessed. For example, a request to update the `aws-provisioner-v1`',
    'provisioner with a body `{description: \'This provisioner is great\'}` would require you to have the scope',
    '`queue:declare-provisioner:aws-provisioner-v1#description`.',
    '',
    'The term "provisioner" is taken broadly to mean anything with a provisionerId.',
    'This does not necessarily mean there is an associated service performing any',
    'provisioning activity.',
  ].join('\n'),
}, async function(req, res) {
  const provisionerId = req.params.provisionerId;
  const {stability, description, expires, actions} = req.body;

  await req.authorize({
    provisionerId,
    properties: Object.keys(req.body),
  });

  const provisioner = await this.workerInfo.upsertProvisioner({
    provisionerId,
    stability,
    description,
    expires,
    actions,
  });

  return res.reply(provisioner.json());
});

/** Count pending tasks for workerType */
builder.declare({
  method: 'get',
  route: '/pending/:provisionerId/:workerType',
  name: 'pendingTasks',
  stability: APIBuilder.stability.stable,
  category: 'Queue Service',
  output: 'pending-tasks-response.yml',
  title: 'Get Number of Pending Tasks',
  description: [
    'Get an approximate number of pending tasks for the given `provisionerId`',
    'and `workerType`.',
    '',
    'The underlying Azure Storage Queues only promises to give us an estimate.',
    'Furthermore, we cache the result in memory for 20 seconds. So consumers',
    'should be no means expect this to be an accurate number.',
    'It is, however, a solid estimate of the number of pending tasks.',
  ].join('\n'),
}, async function(req, res) {
  let provisionerId = req.params.provisionerId;
  let workerType = req.params.workerType;

  // Get number of pending message
  let count = await this.queueService.countPendingMessages(
    provisionerId, workerType,
  );

  // Reply to call with count `pendingTasks`
  return res.reply({
    provisionerId: provisionerId,
    workerType: workerType,
    pendingTasks: count,
  });
});

/** List worker-types for a given provisioner */
builder.declare({
  method: 'get',
  route: '/provisioners/:provisionerId/worker-types',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  name: 'listWorkerTypes',
  category: 'Queue Service',
  stability: APIBuilder.stability.experimental,
  output: 'list-workertypes-response.yml',
  title: 'Get a list of all active worker-types',
  description: [
    'Get all active worker-types for the given provisioner.',
    '',
    'The response is paged. If this end-point returns a `continuationToken`, you',
    'should call the end-point again with the `continuationToken` as a query-string',
    'option. By default this end-point will list up to 1000 worker-types in a single',
    'page. You may limit this with the query-string parameter `limit`.',
  ].join('\n'),
}, async function(req, res) {
  const continuation = req.query.continuationToken || null;
  const provisionerId = req.params.provisionerId;
  const limit = Math.min(1000, parseInt(req.query.limit || 1000, 10));

  const workerTypes = await this.WorkerType.scan({provisionerId}, {continuation, limit});

  const result = {
    workerTypes: workerTypes.entries.map(workerType => workerType.json()),
  };

  if (workerTypes.continuation) {
    result.continuationToken = workerTypes.continuation;
  }

  return res.reply(result);
});

/** Get a worker-type from a provisioner */
builder.declare({
  method: 'get',
  route: '/provisioners/:provisionerId/worker-types/:workerType',
  name: 'getWorkerType',
  stability: APIBuilder.stability.experimental,
  category: 'Queue Service',
  output: 'workertype-response.yml',
  title: 'Get a worker-type',
  description: [
    'Get a worker-type from a provisioner.',
  ].join('\n'),
}, async function(req, res) {
  const {provisionerId, workerType} = req.params;

  const [wType, provisioner] = await Promise.all([
    this.WorkerType.load({
      provisionerId,
      workerType,
      expires: Entity.op.greaterThan(new Date()),
    }, true),
    this.Provisioner.load({provisionerId}, true),
  ]);

  if (!wType || !provisioner) {
    return res.reportError('ResourceNotFound',
      'Worker-type `{{workerType}}` with Provisioner `{{provisionerId}}` not found. Are you sure it was created?', {
        workerType,
        provisionerId,
      },
    );
  }

  const actions = provisioner.actions.filter(action => action.context === 'worker-type');
  return res.reply(Object.assign({}, wType.json(), {actions}));
});

/** Update a worker-type */
builder.declare({
  method: 'put',
  route: '/provisioners/:provisionerId/worker-types/:workerType',
  name: 'declareWorkerType',
  stability: APIBuilder.stability.experimental,
  category: 'Queue Service',
  scopes: {AllOf: [
    {
      for: 'property',
      in: 'properties',
      each: 'queue:declare-worker-type:<provisionerId>/<workerType>#<property>',
    },
  ]},
  output: 'workertype-response.yml',
  input: 'update-workertype-request.yml',
  title: 'Update a worker-type',
  description: [
    'Declare a workerType, supplying some details about it.',
    '',
    '`declareWorkerType` allows updating one or more properties of a worker-type as long as the required scopes are',
    'possessed. For example, a request to update the `gecko-b-1-w2008` worker-type within the `aws-provisioner-v1`',
    'provisioner with a body `{description: \'This worker type is great\'}` would require you to have the scope',
    '`queue:declare-worker-type:aws-provisioner-v1/gecko-b-1-w2008#description`.',
  ].join('\n'),
}, async function(req, res) {
  const {provisionerId, workerType} = req.params;
  const {stability, description, expires} = req.body;

  await req.authorize({
    provisionerId,
    workerType,
    properties: Object.keys(req.body),
  });

  const [wType, provisioner] = await Promise.all([
    this.workerInfo.upsertWorkerType({
      provisionerId,
      workerType,
      stability,
      description,
      expires,
    }),
    this.workerInfo.upsertProvisioner({provisionerId}),
  ]);

  const actions = provisioner.actions.filter(action => action.context === 'worker-type');
  return res.reply(Object.assign({}, wType.json(), {actions}));
});

/** List all active workerGroup/workerId of a workerType */
builder.declare({
  method: 'get',
  route: '/provisioners/:provisionerId/worker-types/:workerType/workers',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
    quarantined: /^(true|false)$/,
  },
  name: 'listWorkers',
  stability: APIBuilder.stability.experimental,
  category: 'Queue Service',
  output: 'list-workers-response.yml',
  title: 'Get a list of all active workers of a workerType',
  description: [
    'Get a list of all active workers of a workerType.',
    '',
    '`listWorkers` allows a response to be filtered by quarantined and non quarantined workers.',
    'To filter the query, you should call the end-point with `quarantined` as a query-string option with a',
    'true or false value.',
    '',
    'The response is paged. If this end-point returns a `continuationToken`, you',
    'should call the end-point again with the `continuationToken` as a query-string',
    'option. By default this end-point will list up to 1000 workers in a single',
    'page. You may limit this with the query-string parameter `limit`.',
  ].join('\n'),
}, async function(req, res) {
  const continuation = req.query.continuationToken || null;
  const quarantined = req.query.quarantined || null;
  const provisionerId = req.params.provisionerId;
  const workerType = req.params.workerType;
  const limit = Math.min(1000, parseInt(req.query.limit || 1000, 10));
  const now = new Date();

  const workerQuery = {
    provisionerId,
    workerType,
  };

  if (quarantined === 'true') {
    workerQuery.quarantineUntil = Entity.op.greaterThan(now);
  } else if (quarantined === 'false') {
    workerQuery.quarantineUntil = Entity.op.lessThan(now);
  }

  const workers = await this.Worker.scan(workerQuery, {continuation, limit});

  const result = {
    workers: workers.entries.filter(worker => {
      // filter out anything that is both expired and not quarantined,
      // so that quarantined workers remain visible even after expiration
      return worker.expires >= now || worker.quarantineUntil >= now;
    }).map(worker => {
      let entry = {
        workerGroup: worker.workerGroup,
        workerId: worker.workerId,
        firstClaim: worker.firstClaim.toJSON(),
      };
      if (worker.recentTasks.length > 0) {
        entry.latestTask = worker.recentTasks[worker.recentTasks.length - 1];
      }
      if (worker.quarantineUntil.getTime() > now.getTime()) {
        entry.quarantineUntil = worker.quarantineUntil.toJSON();
      }
      return entry;
    }),
  };

  if (workers.continuation) {
    result.continuationToken = workers.continuation;
  }

  return res.reply(result);
});

/** Get a worker from a worker-type */
builder.declare({
  method: 'get',
  route: '/provisioners/:provisionerId/worker-types/:workerType/workers/:workerGroup/:workerId',
  name: 'getWorker',
  stability: APIBuilder.stability.experimental,
  output: 'worker-response.yml',
  title: 'Get a worker-type',
  category: 'Queue Service',
  description: [
    'Get a worker from a worker-type.',
  ].join('\n'),
}, async function(req, res) {
  const {provisionerId, workerType, workerGroup, workerId} = req.params;

  const [worker, wType, provisioner] = await Promise.all([
    this.Worker.load({
      provisionerId,
      workerType,
      workerGroup,
      workerId,
    }, true),
    this.WorkerType.load({provisionerId, workerType}, true),
    this.Provisioner.load({provisionerId}, true),
  ]);

  // do not consider workers expired until their quarantine date expires.
  const now = new Date();
  const expired = worker && worker.expires < now && worker.quarantineUntil < now;

  if (expired || !worker || !wType || !provisioner) {
    return res.reportError('ResourceNotFound',
      'Worker with workerId `{{workerId}}`, workerGroup `{{workerGroup}}`,' +
      'worker-type `{{workerType}}` and provisionerId `{{provisionerId}}` not found. ' +
      'Are you sure it was created?', {
        workerId,
        workerGroup,
        workerType,
        provisionerId,
      },
    );
  }

  const actions = provisioner.actions.filter(action => action.context === 'worker');
  return res.reply(Object.assign({}, worker.json(), {actions}));
});

/** Quarantine a Worker */
builder.declare({
  method: 'put',
  route: '/provisioners/:provisionerId/worker-types/:workerType/workers/:workerGroup/:workerId',
  name: 'quarantineWorker',
  stability: APIBuilder.stability.experimental,
  category: 'Queue Service',
  scopes: {AllOf: [
    'queue:quarantine-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>',
  ]},
  input: 'quarantine-worker-request.yml',
  output: 'worker-response.yml',
  title: 'Quarantine a worker',
  description: [
    'Quarantine a worker',
  ].join('\n'),
}, async function(req, res) {
  let result;
  const {provisionerId, workerType, workerGroup, workerId} = req.params;
  const {quarantineUntil} = req.body;
  const [worker, provisioner] = await Promise.all([
    this.Worker.load({provisionerId, workerType, workerGroup, workerId}, true),
    this.Provisioner.load({provisionerId}, true),
  ]);

  if (!worker) {
    return res.reportError('ResourceNotFound',
      'Worker with workerId `{{workerId}}`, workerGroup `{{workerGroup}}`,' +
      'worker-type `{{workerType}}` and provisionerId `{{provisionerId}}` not found. ' +
      'Are you sure it was created?', {
        workerId,
        workerGroup,
        workerType,
        provisionerId,
      },
    );
  }

  result = await worker.modify((entity) => {
    entity.quarantineUntil = new Date(quarantineUntil);
  });

  const actions = provisioner.actions.filter(action => action.context === 'worker');
  return res.reply(Object.assign({}, result.json(), {actions}));
});

/** Update a worker */
builder.declare({
  method: 'put',
  route: '/provisioners/:provisionerId/worker-types/:workerType/:workerGroup/:workerId',
  name: 'declareWorker',
  stability: APIBuilder.stability.experimental,
  category: 'Queue Service',
  scopes: {AllOf: [
    {
      for: 'property',
      in: 'properties',
      each: 'queue:declare-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>#<property>',
    },
  ]},
  output: 'worker-response.yml',
  input: 'update-worker-request.yml',
  title: 'Declare a worker',
  description: [
    'Declare a worker, supplying some details about it.',
    '',
    '`declareWorker` allows updating one or more properties of a worker as long as the required scopes are',
    'possessed.',
  ].join('\n'),
}, async function(req, res) {
  const {provisionerId, workerType, workerGroup, workerId} = req.params;
  const {expires} = req.body;

  await req.authorize({
    provisionerId,
    workerType,
    workerGroup,
    workerId,
    properties: Object.keys(req.body),
  });

  const [worker, _, provisioner] = await Promise.all([
    this.workerInfo.upsertWorker({provisionerId, workerType, workerGroup, workerId, expires}),
    this.workerInfo.upsertWorkerType({provisionerId, workerType}),
    this.workerInfo.upsertProvisioner({provisionerId}),
  ]);

  const actions = provisioner.actions.filter(action => action.context === 'worker');
  return res.reply(Object.assign({}, worker.json(), {actions}));
});
