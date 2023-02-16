const assert = require('assert');
const _ = require('lodash');
const { APIBuilder, paginateResults } = require('taskcluster-lib-api');
const taskcluster = require('taskcluster-client');
const taskCreds = require('./task-creds');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { Task, Worker, TaskQueue, Provisioner, TaskGroup } = require('./data');
const { addSplitFields, useOnlyTaskQueueId, joinTaskQueueId, splitTaskQueueId } = require('./utils');

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
  title: 'Queue Service',
  description: [
    'The queue service is responsible for accepting tasks and tracking their state',
    'as they are executed by workers, in order to ensure they are eventually',
    'resolved.',
    '',
    '## Artifact Storage Types',
    '',
    '* **Object artifacts** contain arbitrary data, stored via the object service.',
    '* **Redirect artifacts**, will redirect the caller to URL when fetched',
    'with a a 303 (See Other) response.  Clients will not apply any kind of',
    'authentication to that URL.',
    '* **Link artifacts**, will be treated as if the caller requested the linked',
    'artifact on the same task.  Links may be chained, but cycles are forbidden.',
    'The caller must have scopes for the linked artifact, or a 403 response will',
    'be returned.',
    '* **Error artifacts**, only consists of meta-data which the queue will',
    'store for you. These artifacts are only meant to indicate that you the',
    'worker or the task failed to generate a specific artifact, that you',
    'would otherwise have uploaded. For example docker-worker will upload an',
    'error artifact, if the file it was supposed to upload doesn\'t exists or',
    'turns out to be a directory. Clients requesting an error artifact will',
    'get a `424` (Failed Dependency) response. This is mainly designed to',
    'ensure that dependent tasks can distinguish between artifacts that were',
    'suppose to be generated and artifacts for which the name is misspelled.',
    '* **S3 artifacts** are used for static files which will be',
    'stored on S3. When creating an S3 artifact the queue will return a',
    'pre-signed URL to which you can do a `PUT` request to upload your',
    'artifact. Note that `PUT` request **must** specify the `content-length`',
    'header and **must** give the `content-type` header the same value as in',
    'the request to `createArtifact`. S3 artifacts will be deprecated soon,',
    'and users should prefer object artifacts instead.',
    '',
    '## Artifact immutability',
    '',
    'Generally speaking you cannot overwrite an artifact when created.',
    'But if you repeat the request with the same properties the request will',
    'succeed as the operation is idempotent.',
    'This is useful if you need to refresh a signed URL while uploading.',
    'Do not abuse this to overwrite artifacts created by another entity!',
    'Such as worker-host overwriting artifact created by worker-code.',
    '',
    'The queue defines the following *immutability special cases*:',
    '',
    '* A `reference` artifact can replace an existing `reference` artifact.',
    '* A `link` artifact can replace an existing `reference` artifact.',
    '* Any artifact\'s `expires` can be extended (made later, but not earlier).',
  ].join('\n'),
  serviceName: 'queue',
  apiVersion: 'v1',
  params: {
    taskId: SLUGID_PATTERN,
    taskGroupId: SLUGID_PATTERN,
    taskQueueId: /^[A-Za-z0-9_-]{1,38}\/[A-Za-z0-9_-]{1,38}$/,
    provisionerId: GENERIC_ID_PATTERN,
    workerType: GENERIC_ID_PATTERN,
    workerGroup: GENERIC_ID_PATTERN,
    workerId: GENERIC_ID_PATTERN,
    runId: RUN_ID_PATTERN,
    name: /^[\x20-\x7e]+$/, // Artifact names must be printable ASCII
  },
  context: [
    'db', // Database instance
    'taskGroupExpiresExtension', // Time delay before expiring a task-group
    'signPublicArtifactUrls', // Whether to use AWS signed URLs for public s3 artifacts
    'publicBucket', // bucket instance for public s3 artifacts
    'privateBucket', // bucket instance for private s3 artifacts
    'publisher', // publisher from base.Exchanges
    'claimTimeout', // Number of seconds before a claim expires
    'queueService', // Azure QueueService object from queueservice.js
    'regionResolver', // Instance of EC2RegionResolver,
    'credentials', // TC credentials for issuing temp creds on claim
    'dependencyTracker', // Instance of DependencyTracker
    'monitor', // base.monitor instance
    'workClaimer', // Instance of WorkClaimer
    'workerInfo', // Instance of WorkerInfo
    'artifactRegion', // AWS Region where s3 artifacts are stored
    'LRUcache', // LRU cache for tasks
    'objectService', // Object service API client
  ],
});

// Export builder
module.exports = builder;

/** Get task */
builder.declare({
  method: 'get',
  route: '/task/:taskId',
  name: 'task',
  scopes: 'queue:get-task:<taskId>',
  stability: APIBuilder.stability.stable,
  category: 'Tasks',
  idempotent: true,
  output: 'task.yml',
  title: 'Get Task Definition',
  description: [
    'This end-point will return the task-definition. Notice that the task',
    'definition may have been modified by queue, if an optional property is',
    'not specified the queue may provide a default value.',
  ].join('\n'),
}, async function(req, res) {
  const { taskId } = req.params;

  let task;
  if (this.LRUcache.has(taskId)) {
    task = this.LRUcache.get(taskId);
  } else {
    task = await Task.get(this.db, taskId);
    if (task) {
      this.LRUcache.set(taskId, task);
    }
  }

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound', [
      '`{{taskId}}` does not correspond to a task that exists.',
      'Are you sure this task has already been submitted?',
    ].join('\n'), { taskId });
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
  scopes: 'queue:status:<taskId>',
  stability: APIBuilder.stability.stable,
  input: undefined, // No input is accepted
  output: 'task-status-response.yml',
  category: 'Tasks',
  title: 'Get task status',
  description: [
    'Get task status structure from `taskId`',
  ].join('\n'),
}, async function(req, res) {
  let task = await Task.get(this.db, req.params.taskId);

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
  query: paginateResults.query,
  name: 'listTaskGroup',
  scopes: 'queue:list-task-group:<taskGroupId>',
  stability: APIBuilder.stability.stable,
  category: 'Tasks',
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

  // Find taskGroup and list of members
  let [
    taskGroups,
    { continuationToken, rows },
  ] = await Promise.all([
    this.db.fns.get_task_group2(taskGroupId),
    paginateResults({
      query: req.query,
      fetch: (size, offset) => this.db.fns.get_tasks_by_task_group_projid(taskGroupId, size, offset),
    }),
  ]);

  // If no taskGroup was found
  if (taskGroups.length === 0) {
    return res.reportError('ResourceNotFound',
      'No task-group with taskGroupId: `{{taskGroupId}}`', {
        taskGroupId,
      },
    );
  }

  // Build result
  let result = {
    taskGroupId,
    tasks: rows.map(row => {
      const task = Task.fromDb(row);
      return {
        status: task.status(),
        task: task.definition(),
      };
    }),
  };
  if (continuationToken) {
    result.continuationToken = continuationToken;
  }

  return res.reply(result);
});

/** Get task group info */
builder.declare({
  method: 'get',
  route: '/task-group/:taskGroupId',
  name: 'getTaskGroup',
  scopes: 'queue:list-task-group:<taskGroupId>',
  stability: APIBuilder.stability.stable,
  category: 'Tasks',
  output: 'task-group-response.yml',
  title: 'Get Task Group',
  description: [
    'Get task group information by `taskGroupId`.',
    '',
    'This will return meta-information associated with the task group.',
    'It contains information about task group expiry date or if it is sealed.',
  ].join('\n'),
}, async function (req, res) {
  let taskGroupId = req.params.taskGroupId;

  const taskGroup = await TaskGroup.get(this.db, taskGroupId);
  if (!taskGroup) {
    return res.reportError('ResourceNotFound',
      'No task-group with taskGroupId: `{{taskGroupId}}`', {
        taskGroupId,
      });
  }

  // fetch project ids to construct scopes: `queue:seal-task-group:<taskGroupId>`
  let projectIds = await taskGroup.getProjectIds(this.db);

  await req.authorize({
    taskGroupId,
    projectIds,
  });

  return res.reply(taskGroup.serialize());
});

/** Seal Task Group */
builder.declare({
  method: 'post',
  route: '/task-group/:taskGroupId/seal',
  name: 'sealTaskGroup',
  scopes: {
    AnyOf: [
      'queue:seal-task-group:<taskGroupId>',
      {
        AllOf: [{
          for: 'projectId',
          in: 'projectIds',
          each: 'queue:seal-task-group-in-project:<projectId>',
        }],
      },
    ],
  },
  stability: APIBuilder.stability.experimental,
  category: 'Tasks',
  input: undefined,
  output: 'task-group-response.yml',
  title: 'Seal Task Group',
  description: [
    'Seal task group to prevent creation of new tasks.',
    '',
    'Task group can be sealed once and is irreversible. Calling it multiple times',
    'will return same result and will not update it again.',
  ].join('\n'),
}, async function (req, res) {
  const taskGroupId = req.params.taskGroupId;

  const taskGroup = await TaskGroup.get(this.db, taskGroupId);
  if (!taskGroup) {
    return res.reportError('ResourceNotFound',
      'No task-group with taskGroupId: `{{taskGroupId}}`', {
        taskGroupId,
      });
  }

  // fetch project ids to construct scopes: `queue:seal-task-group:<taskGroupId>`
  let projectIds = await taskGroup.getProjectIds(this.db);

  await req.authorize({
    taskGroupId,
    projectIds,
  });

  const updated = TaskGroup.fromDbRows(await this.db.fns.seal_task_group(taskGroupId));

  await this.publisher.taskGroupSealed({
    taskGroupId,
    schedulerId: updated.schedulerId,
  }, []);

  this.monitor.log.taskGroupSealed({
    taskGroupId,
    schedulerId: updated.schedulerId,
  });

  return res.reply(updated.serialize());
});

/** List tasks dependents */
builder.declare({
  method: 'get',
  route: '/task/:taskId/dependents',
  query: paginateResults.query,
  name: 'listDependentTasks',
  scopes: 'queue:list-dependent-tasks:<taskId>',
  category: 'Tasks',
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

  // Find task and list dependents
  let [
    task,
    { continuationToken, rows },
  ] = await Promise.all([
    Task.get(this.db, taskId),
    paginateResults({
      query: req.query,
      fetch: (size, offset) => this.db.fns.get_dependent_tasks(taskId, null, null, size, offset),
    }),
  ]);

  // Check if task exists
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'Task with taskId: `{{taskId}}` was not found',
      { taskId },
    );
  }

  // Load tasks
  let tasks = await Promise.all(rows.map(row => Task.get(this.db, row.dependent_task_id)));

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
  if (continuationToken) {
    result.continuationToken = continuationToken;
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
    taskId,
    priorities,
    routes: taskDef.routes,
    scopes: taskDef.scopes,
    schedulerId: taskDef.schedulerId,
    projectId: taskDef.projectId,
    taskGroupId: taskDef.taskGroupId || taskId,
    provisionerId: taskDef.provisionerId,
    workerType: taskDef.workerType,
    taskQueueId: taskDef.taskQueueId,
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
      message: '`created` cannot be in the past (max 15min drift)',
      details: { created: taskDef.created },
    };
  }
  if (created.getTime() > new Date().getTime() + 15 * 60 * 1000) {
    return {
      code: 'InputError',
      message: '`created` cannot be in the future (max 15min drift)',
      details: { created: taskDef.created },
    };
  }
  if (created.getTime() > deadline.getTime()) {
    return {
      code: 'InputError',
      message: '`deadline` cannot be later than `created`',
      details: { created: taskDef.created, deadline: taskDef.deadline },
    };
  }
  if (deadline.getTime() < new Date().getTime()) {
    return {
      code: 'InputError',
      message: '`deadline` cannot be in the past',
      details: { deadline: taskDef.deadline },
    };
  }

  let msToDeadline = deadline.getTime() - new Date().getTime();
  // Validate that deadline is less than 5 days from now, allow 15 min drift
  // NOTE: Azure does not allow more than 7 days - see https://bugzilla.mozilla.org/show_bug.cgi?id=1604175
  if (msToDeadline > 5 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000) {
    return {
      code: 'InputError',
      message: '`deadline` cannot be more than 5 days into the future',
      details: { deadline: taskDef.deadline },
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
      message: '`expires` cannot be before `deadline`',
      details: { deadline: taskDef.deadline, expires: taskDef.expires },
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
  let schedulerId = taskDef.schedulerId;
  let expires = new Date(taskDef.expires);

  try {
    await ctx.db.fns.ensure_task_group(taskGroupId, schedulerId, expires);
  } catch (err) {
    if (err.code !== UNIQUE_VIOLATION) {
      throw err;
    }
    res.reportError(
      'RequestConflict', [
        'Task group `{{taskGroupId}}` contains tasks with a schedulerId other',
        'than `{{schedulerId}}`. All tasks in the same task-group must have',
        'the same schedulerId.',
      ].join('\n'), { taskGroupId, schedulerId });
    return false;
  }

  const [isSealed] = await ctx.db.fns.is_task_group_sealed(taskGroupId);
  if (isSealed?.is_task_group_sealed) {
    res.reportError(
      'RequestConflict',
      'Task group `{{taskGroupId}}` is sealed and does not accept new tasks.',
      { taskGroupId });
  }

  return true;
};

/** Create tasks */
builder.declare({
  method: 'put',
  route: '/task/:taskId',
  name: 'createTask',
  stability: APIBuilder.stability.stable,
  idempotent: true,
  category: 'Tasks',
  scopes: { AllOf: [
    { for: 'scope', in: 'scopes', each: '<scope>' },
    { for: 'route', in: 'routes', each: 'queue:route:<route>' },
    'queue:create-task:project:<projectId>',
    'queue:scheduler-id:<schedulerId>',
    { AnyOf: [
      {
        for: 'priority',
        in: 'priorities',
        each: 'queue:create-task:<priority>:<provisionerId>/<workerType>',
      },
    ] },
  ] },
  input: 'create-task-request.yml',
  output: 'task-status-response.yml',
  title: 'Create New Task',
  description: [
    'Create a new task, this is an **idempotent** operation, so repeat it if',
    'you get an internal server error or network connection is dropped.',
    '',
    '**Task `deadline`**: the deadline property can be no more than 5 days',
    'into the future. This is to limit the amount of pending tasks not being',
    'taken care of. Ideally, you should use a much shorter deadline.',
    '',
    '**Task expiration**: the `expires` property must be greater than the',
    'task `deadline`. If not provided it will default to `deadline` + one',
    'year. Notice that artifacts created by a task must expire before the',
    'task\'s expiration.',
    '',
    '**Task specific routing-keys**: using the `task.routes` property you may',
    'define task specific routing-keys. If a task has a task specific',
    'routing-key: `<route>`, then when the AMQP message about the task is',
    'published, the message will be CC\'ed with the routing-key:',
    '`route.<route>`. This is useful if you want another component to listen',
    'for completed tasks you have posted.  The caller must have scope',
    '`queue:route:<route>` for each route.',
    '',
    '**Dependencies**: any tasks referenced in `task.dependencies` must have',
    'already been created at the time of this call.',
    '',
    '**Scopes**: Note that the scopes required to complete this API call depend',
    'on the content of the `scopes`, `routes`, `schedulerId`, `priority`,',
    '`provisionerId`, and `workerType` properties of the task definition.',
    '',
    'If the task group was sealed, this end-point will return `409` reporting',
    '`RequestConflict` to indicate that it is no longer possible to add new tasks',
    'for this `taskGroupId`.',
  ].join('\n'),
}, async function(req, res) {
  let taskId = req.params.taskId;
  let taskDef = req.body;

  // During the transition to the taskQueueId identifier, we have to
  // accept all possible incoming definitions that may contain either
  // the old, the new, or both identifiers
  if (taskDef.provisionerId && taskDef.workerType && taskDef.taskQueueId) {
    if (joinTaskQueueId(taskDef.provisionerId, taskDef.workerType) !== taskDef.taskQueueId) {
      return res.reportError('InputError',
        'taskQueueId must match "provisionerId/workerType"',
        {
          provisionerId: taskDef.provisionerId,
          workerType: taskDef.workerType,
          taskQueueId: taskDef.taskQueueId,
        });
    }
  } else if (taskDef.provisionerId && taskDef.workerType) {
    taskDef.taskQueueId = joinTaskQueueId(taskDef.provisionerId, taskDef.workerType);
  } else if (taskDef.taskQueueId) {
    addSplitFields(taskDef);
  } else {
    return res.reportError('InputError',
      'at least a provisionerId and a workerType or a taskQueueId must be provided"',
      {});
  }

  // fill in the default `none` projectId if none was given
  if (!taskDef.projectId) {
    taskDef.projectId = 'none';
  }

  await authorizeTaskCreation(req, taskId, taskDef);

  // Patch default values and validate timestamps
  let detail = patchAndValidateTaskDef(taskId, taskDef);
  if (detail) {
    return res.reportError(detail.code, detail.message, detail.details);
  }

  if (taskDef.scopes.some(s => s.endsWith('**'))) {
    return res.reportError('InputError', 'scopes must not end with `**`', {});
  }

  // Ensure group membership is declared, and that schedulerId isn't conflicting
  if (!await ensureTaskGroup(this, taskId, taskDef, res)) {
    return;
  }

  // Insert entry in deadline queue
  await this.queueService.putDeadlineMessage(
    taskId,
    taskDef.taskGroupId,
    taskDef.schedulerId,
    new Date(taskDef.deadline),
  );

  let task = Task.fromApi(taskId, taskDef);
  useOnlyTaskQueueId(task);

  // Fetch the status of the task before creation, so that `taskDefined` messages
  // have a default status. This can't be run after create, since create is
  // idempotent and does a DB fetch.
  let initialStatus = task.status();

  try {
    await task.create(this.db);
  } catch (err) {
    if (err.code !== UNIQUE_VIOLATION) {
      throw err;
    }

    return res.reportError('RequestConflict', [
      'taskId `{{taskId}}` already used by another task.',
      'This could be the result of faulty idempotency!',
    ].join('\n'), { taskId });
  }

  // if the task has no dependencies, schedule a run immediately
  if (task.dependencies.length === 0) {
    task.updateStatusWith(
      await this.db.fns.schedule_task(taskId, 'scheduled'));
  } else {
    // Track dependencies, adds a pending run if ready to run
    let err = await this.dependencyTracker.trackDependencies(task);
    // If we get an error here the task will be left in state = 'unscheduled',
    // any attempt to use the same taskId will fail. And eventually the task
    // will be resolved deadline-expired. But since createTask never returned
    // successfully...
    if (err) {
      return res.reportError('InputError', err.message, err.details);
    }
  }

  // Construct task status, as we'll return this many times
  let status = task.status();
  let taskPulseContents = {
    tags: task.tags,
  };

  // If the first run status is not unscheduled, then we are not the first
  // call to create this task (due to idempotency). That call will have sent
  // the `taskDefined` message. (This can happen when two identical calls are
  // made to createTask in quick succession, but it is very unlikely.)
  if (initialStatus.state === 'unscheduled') {
    // Publish task-defined message, we want this arriving before the
    // task-pending message, so we have to await publication here
    await this.publisher.taskDefined({ status: initialStatus, task: taskPulseContents }, task.routes);
    this.monitor.log.taskDefined({ taskId });
  }

  // Same as above but for tasks with no dependencies, scheduling the first run.
  let runZeroState = (task.runs[0] || { state: 'unscheduled' }).state;
  if (runZeroState === 'pending') {
    await Promise.all([
      // Put message into the task pending queue
      this.queueService.putPendingMessage(task, 0),

      // Put message in appropriate azure queue, and publish message to pulse
      this.publisher.taskPending({ status, task: taskPulseContents, runId: 0 }, task.routes),
    ]);
    this.monitor.log.taskPending({ taskId, runId: 0 });
  }

  // Reply
  return res.reply({ status });
});

/** Schedule previously defined tasks */
builder.declare({
  method: 'post',
  route: '/task/:taskId/schedule',
  name: 'scheduleTask',
  stability: APIBuilder.stability.stable,
  category: 'Tasks',
  scopes: { AnyOf: [
    'queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>',
    'queue:schedule-task-in-project:<projectId>',
    { AllOf: [ // Legacy scopes
      'queue:schedule-task',
      'assume:scheduler-id:<schedulerId>/<taskGroupId>',
    ] },
  ] },
  input: undefined, // No input accepted
  output: 'task-status-response.yml',
  title: 'Schedule Defined Task',
  description: [
    'scheduleTask will schedule a task to be executed, even if it has',
    'unresolved dependencies. A task would otherwise only be scheduled if',
    'its dependencies were resolved.',
    '',
    'This is useful if you have defined a task that depends on itself or on',
    'some other task that has not been resolved, but you wish the task to be',
    'scheduled immediately.',
    '',
    'This will announce the task as pending and workers will be allowed to',
    'claim it and resolve the task.',
    '',
    '**Note** this operation is **idempotent** and will not fail or complain',
    'if called with a `taskId` that is already scheduled, or even resolved.',
    'To reschedule a task previously resolved, use `rerunTask`.',
  ].join('\n'),
}, async function(req, res) {
  let taskId = req.params.taskId;
  let task = await Task.get(this.db, taskId);

  // If task entity doesn't exists, we return ResourceNotFound
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'taskId `{{taskId}}` not found. Are you sure it exists?',
      { taskId },
    );
  }

  await req.authorize({
    taskId,
    schedulerId: task.schedulerId,
    taskGroupId: task.taskGroupId,
    projectId: task.projectId,
  });

  // Attempt to schedule task
  let status = await this.dependencyTracker.scheduleTask(task);

  // If null it must because deadline is exceeded
  if (status === null) {
    return res.reportError(
      'RequestConflict',
      'Task `{{taskId}}` can\'t be scheduled past its deadline at ' +
      '{{deadline}}.', {
        taskId,
        deadline: task.deadline.toJSON(),
      },
    );
  }

  return res.reply({ status });
});

/** Rerun a previously resolved task */
builder.declare({
  method: 'post',
  route: '/task/:taskId/rerun',
  name: 'rerunTask',
  stability: APIBuilder.stability.stable,
  category: 'Tasks',
  scopes: { AnyOf: [
    'queue:rerun-task:<schedulerId>/<taskGroupId>/<taskId>',
    'queue:rerun-task-in-project:<projectId>',
    { AllOf: [ // Legacy scopes
      'queue:rerun-task',
      'assume:scheduler-id:<schedulerId>/<taskGroupId>',
    ] },
  ] },
  input: undefined, // No input accepted
  output: 'task-status-response.yml',
  title: 'Rerun a Resolved Task',
  description: [
    'This method _reruns_ a previously resolved task, even if it was',
    '_completed_. This is useful if your task completes unsuccessfully, and',
    'you just want to run it from scratch again. This will also reset the',
    'number of `retries` allowed. It will schedule a task that is _unscheduled_',
    'regardless of the state of its dependencies.',
    '',
    'Remember that `retries` in the task status counts the number of runs that',
    'the queue have started because the worker stopped responding, for example',
    'because a spot node died.',
    '',
    '**Remark** this operation is idempotent: if it is invoked for a task that',
    'is `pending` or `running`, it will just return the current task status.',
  ].join('\n'),
}, async function(req, res) {
  let taskId = req.params.taskId;
  let task = await Task.get(this.db, taskId);

  // Report ResourceNotFound, if task entity doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound', [
      '`{{taskId}}` does not correspond to a task that exists.',
      'Are you sure this task has been submitted before?',
    ].join('\n'), {
      taskId,
    });
  }

  await req.authorize({
    taskId,
    schedulerId: task.schedulerId,
    taskGroupId: task.taskGroupId,
    projectId: task.projectId,
  });

  // Validate deadline
  if (task.deadline.getTime() < new Date().getTime()) {
    return res.reportError(
      'RequestConflict',
      'Task `{{taskId}}` can\'t be rescheduled past its deadline of ' +
      '{{deadline}}.', {
        taskId,
        deadline: task.deadline.toJSON(),
      },
    );
  }

  task.updateStatusWith(
    await this.db.fns.rerun_task(taskId));

  let state = task.state();

  // If not running or pending, and we couldn't create more runs then we have
  // a conflict
  if (state !== 'pending' && state !== 'running' &&
      task.runs.length >= MAX_RUNS_ALLOWED) {
    return res.reportError(
      'RequestConflict',
      'Maximum number of runs reached ({{max_runs_allowed}}).', {
        max_runs_allowed: MAX_RUNS_ALLOWED,
      },
    );
  }

  // Put message in appropriate azure queue, and publish message to pulse,
  // if the initial run is pending
  let status = task.status();
  if (state === 'pending') {
    let runId = task.runs.length - 1;
    await Promise.all([
      this.queueService.putPendingMessage(task, runId),
      this.publisher.taskPending({
        status: status,
        runId: runId,
      }, task.routes),
    ]);
    this.monitor.log.taskPending({ taskId, runId });
  }

  return res.reply({ status });
});

/** Cancel a task */
builder.declare({
  method: 'post',
  route: '/task/:taskId/cancel',
  name: 'cancelTask',
  stability: APIBuilder.stability.stable,
  category: 'Tasks',
  scopes: { AnyOf: [
    'queue:cancel-task:<schedulerId>/<taskGroupId>/<taskId>',
    'queue:cancel-task-in-project:<projectId>',
    { AllOf: [ // Legacy scopes
      'queue:cancel-task',
      'assume:scheduler-id:<schedulerId>/<taskGroupId>',
    ] },
  ] },
  input: undefined, // No input accepted
  output: 'task-status-response.yml',
  title: 'Cancel Task',
  description: [
    'This method will cancel a task that is either `unscheduled`, `pending` or',
    '`running`. It will resolve the current run as `exception` with',
    '`reasonResolved` set to `canceled`. If the task isn\'t scheduled yet, ie.',
    'it doesn\'t have any runs, an initial run will be added and resolved as',
    'described above. Hence, after canceling a task, it cannot be scheduled',
    'with `queue.scheduleTask`, but a new run can be created with',
    '`queue.rerun`. These semantics is equivalent to calling',
    '`queue.scheduleTask` immediately followed by `queue.cancelTask`.',
    '',
    '**Remark** this operation is idempotent, if you try to cancel a task that',
    'isn\'t `unscheduled`, `pending` or `running`, this operation will just',
    'return the current task status.',
  ].join('\n'),
}, async function(req, res) {
  let taskId = req.params.taskId;
  let task = await Task.get(this.db, taskId);

  // Report ResourceNotFound, if task entity doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound',
      'Task `{{taskId}}` not found. Are you sure it was created?', {
        taskId,
      },
    );
  }

  await req.authorize({
    taskId,
    schedulerId: task.schedulerId,
    taskGroupId: task.taskGroupId,
    projectId: task.projectId,
  });

  // Validate deadline
  if (task.deadline.getTime() < new Date().getTime()) {
    return res.reportError(
      'RequestConflict',
      'Task `{{taskId}}` can\'t be canceled past its deadline of ' +
      '{{deadline}}.', {
        taskId,
        deadline: task.deadline.toJSON(),
      },
    );
  }

  // Modify the task
  if (!task.updateStatusWith(
    await this.db.fns.cancel_task(taskId, 'canceled'))) {
    // modification failed, so re-fetch the task and continue; this may send
    // a duplicate pulse message, but that's OK
    task = await Task.get(this.db, taskId);
  }

  // Get the last run, there should always be one
  let run = _.last(task.runs);
  if (!run) {
    let err = new Error('There should exist a run after cancelTask!');
    err.taskId = task.taskId;
    err.status = task.status();
    this.monitor.reportError(err);
  }

  // Construct status object
  let status = task.status();

  // If the last run was canceled, resolve dependencies and publish message
  if (run.state === 'exception' && run.reasonResolved === 'canceled') {
    // Update dependency tracker
    await this.queueService.putResolvedMessage(
      taskId,
      task.taskGroupId,
      task.schedulerId,
      'exception',
    );

    // Publish message about the exception
    const runId = task.runs.length - 1;
    await this.publisher.taskException(_.defaults({
      status,
      runId,
    }, _.pick(run, 'workerGroup', 'workerId')), task.routes);
    this.monitor.log.taskException({ taskId, runId });
  }

  return res.reply({ status });
});

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
builder.declare({
  method: 'post',
  route: '/claim-work/:taskQueueId(*)',
  name: 'claimWork',
  stability: APIBuilder.stability.stable,
  category: 'Worker Interface',
  scopes: { AllOf: [
    'queue:claim-work:<taskQueueId>',
    'queue:worker-id:<workerGroup>/<workerId>',
  ] },
  input: 'claim-work-request.yml',
  output: 'claim-work-response.yml',
  title: 'Claim Work',
  description: [
    'Claim pending task(s) for the given task queue.',
    '',
    'If any work is available (even if fewer than the requested number of',
    'tasks, this will return immediately. Otherwise, it will block for tens of',
    'seconds waiting for work.  If no work appears, it will return an emtpy',
    'list of tasks.  Callers should sleep a short while (to avoid denial of',
    'service in an error condition) and call the endpoint again.  This is a',
    'simple implementation of "long polling".',
  ].join('\n'),
}, async function(req, res) {
  let taskQueueId = req.params.taskQueueId;
  let workerGroup = req.body.workerGroup;
  let workerId = req.body.workerId;
  let count = req.body.tasks;

  await req.authorize({
    workerGroup,
    workerId,
    taskQueueId,
  });

  const worker = await Worker.get(this.db, taskQueueId, workerGroup, workerId, new Date());

  // Don't claim tasks when worker is quarantined (but do record the worker
  // being seen, and be sure to wait the 20 seconds so as not to cause a
  // tight loop of claimWork calls from the worker
  if (worker && worker.quarantineUntil.getTime() > new Date().getTime()) {
    await Promise.all([
      this.workerInfo.seen(taskQueueId, workerGroup, workerId),
      sleep20Seconds(),
    ]);
    return res.reply({
      tasks: [],
    });
  }

  // Allow request to abort their claim request, if the connection closes
  let aborted = new Promise(accept => {
    sleep20Seconds().then(accept);
    res.once('close', accept);
  });

  let [result] = await Promise.all([
    this.workClaimer.claim(
      taskQueueId, workerGroup, workerId, count, aborted,
    ),
    this.workerInfo.seen(taskQueueId, workerGroup, workerId),
  ]);

  result.forEach(({ runId, status: { taskId } }) => {
    this.monitor.log.taskClaimed({
      taskQueueId,
      workerGroup,
      workerId,
      taskId,
      runId,
    });
  });

  await this.workerInfo.taskSeen(taskQueueId, workerGroup, workerId, result);

  return res.reply({
    tasks: result,
  });
});

/** Claim a task */
builder.declare({
  method: 'post',
  route: '/task/:taskId/runs/:runId/claim',
  name: 'claimTask',
  stability: APIBuilder.stability.deprecated,
  category: 'Worker Interface',
  scopes: { AllOf: [
    'queue:claim-task:<provisionerId>/<workerType>',
    'queue:worker-id:<workerGroup>/<workerId>',
  ] },
  input: 'task-claim-request.yml',
  output: 'task-claim-response.yml',
  title: 'Claim Task',
  description: [
    'claim a task - never documented',
  ].join('\n'),
}, async function(req, res) {
  let taskId = req.params.taskId;
  let runId = parseInt(req.params.runId, 10);

  let workerGroup = req.body.workerGroup;
  let workerId = req.body.workerId;

  let task = await Task.get(this.db, taskId);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'Task `{{taskId}}` not found. Are you sure it was created?', {
        taskId,
      },
    );
  }

  const { provisionerId, workerType } = splitTaskQueueId(task.taskQueueId);

  await req.authorize({
    workerGroup,
    workerId,
    provisionerId: provisionerId,
    workerType: workerType,
  });

  // Check if task is past deadline
  if (task.deadline.getTime() <= Date.now()) {
    return res.reportError(
      'RequestConflict',
      'Task `{{taskId}}` can\'t be claimed past its deadline of ' +
      '{{deadline}}.', {
        taskId,
        deadline: task.deadline.toJSON(),
      },
    );
  }

  const worker = await Worker.get(this.db, task.taskQueueId, workerGroup, workerId, new Date());

  // Don't record task when worker is quarantined
  if (worker && worker.quarantineUntil.getTime() > new Date().getTime()) {
    return res.reply({});
  }

  // Claim task
  let [result] = await Promise.all([
    this.workClaimer.claimTask(
      taskId, runId, workerGroup, workerId, task,
    ),
    this.workerInfo.seen(task.taskQueueId),
  ]);

  // If the run doesn't exist return ResourceNotFound
  if (result === 'run-not-found') {
    return res.reportError(
      'ResourceNotFound',
      'Run {{runId}} not found on task `{{taskId}}`.', {
        taskId,
        runId,
      },
    );
  }

  // If already claimed we return RequestConflict
  if (result === 'conflict') {
    return res.reportError(
      'RequestConflict',
      'Run {{runId}} was already claimed by another worker.', {
        runId,
      },
    );
  }

  await this.workerInfo.taskSeen(task.taskQueueId, workerGroup, workerId, [result]);

  // Reply to caller
  return res.reply(result);
});

/** Reclaim a task */
builder.declare({
  method: 'post',
  route: '/task/:taskId/runs/:runId/reclaim',
  name: 'reclaimTask',
  stability: APIBuilder.stability.stable,
  category: 'Worker Interface',
  scopes: 'queue:reclaim-task:<taskId>/<runId>',
  output: 'task-reclaim-response.yml',
  title: 'Reclaim task',
  description: [
    'Refresh the claim for a specific `runId` for given `taskId`. This updates',
    'the `takenUntil` property and returns a new set of temporary credentials',
    'for performing requests on behalf of the task. These credentials should',
    'be used in-place of the credentials returned by `claimWork`.',
    '',
    'The `reclaimTask` requests serves to:',
    ' * Postpone `takenUntil` preventing the queue from resolving',
    '   `claim-expired`,',
    ' * Refresh temporary credentials used for processing the task, and',
    ' * Abort execution if the task/run have been resolved.',
    '',
    'If the `takenUntil` timestamp is exceeded the queue will resolve the run',
    'as _exception_ with reason `claim-expired`, and proceeded to retry to the',
    'task. This ensures that tasks are retried, even if workers disappear',
    'without warning.',
    '',
    'If the task is resolved, this end-point will return `409` reporting',
    '`RequestConflict`. This typically happens if the task have been canceled',
    'or the `task.deadline` have been exceeded. If reclaiming fails, workers',
    'should abort the task and forget about the given `runId`. There is no',
    'need to resolve the run or upload artifacts.',
  ].join('\n'),
}, async function(req, res) {
  let taskId = req.params.taskId;
  let runId = parseInt(req.params.runId, 10);

  let task = await Task.get(this.db, taskId);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'Task `{{taskId}}` not found. Are you sure it was created?', {
        taskId,
      },
    );
  }

  // Handle cases where the run doesn't exist
  let run = task.runs[runId];
  if (!run) {
    return res.reportError(
      'ResourceNotFound',
      'Run {{runId}} not found on task `{{taskId}}`.', {
        taskId,
        runId,
      },
    );
  }

  await req.authorize({
    taskId,
    runId,
    workerId: run.workerId,
    workerGroup: run.workerGroup,
  });

  // Check if task is past deadline
  if (task.deadline.getTime() <= Date.now()) {
    return res.reportError(
      'RequestConflict',
      'Task `{{taskId}}` can\'t be reclaimed past its deadline of ' +
      '{{deadline}}.', {
        taskId,
        deadline: task.deadline.toJSON(),
      },
    );
  }

  // Set takenUntil to now + claimTimeout
  let takenUntil = new Date();
  takenUntil.setSeconds(takenUntil.getSeconds() + this.claimTimeout);

  // Put claim-expiration message in queue, if not already done, before
  // reclaiming.  If the reclaim DB operation fails, then this message
  // will be ignored.
  await this.queueService.putClaimMessage(taskId, runId, takenUntil);
  task.updateStatusWith(
    await this.db.fns.reclaim_task(taskId, runId, takenUntil));

  await this.workerInfo.seen(task.taskQueueId, run.workerGroup, run.workerId);

  // Find the run that we (may) have modified
  run = task.runs[runId];

  // If run isn't running we had a conflict
  if (task.runs.length - 1 !== runId || run.state !== 'running') {
    return res.reportError(
      'RequestConflict',
      'Run {{runId}} on task `{{taskId}}` is resolved or not running.', {
        taskId,
        runId,
      },
    );
  }

  let credentials = taskCreds(
    taskId,
    runId,
    run.workerGroup,
    run.workerId,
    takenUntil,
    task.scopes,
    this.credentials,
  );

  this.monitor.log.taskReclaimed({
    taskId,
    runId,
    workerId: run.workerId,
    workerGroup: run.workerGroup,
  });

  // Reply to caller
  return res.reply({
    status: task.status(),
    runId: runId,
    workerGroup: run.workerGroup,
    workerId: run.workerId,
    takenUntil: takenUntil.toJSON(),
    credentials: credentials,
  });
});

/**
 * Resolve a run of a task as `target` ('completed' or 'failed').
 * This function assumes the same context as the API.
 */
let resolveTask = async function(req, res, taskId, runId, target) {
  assert(target === 'completed' ||
         target === 'failed', 'Expected a valid target');

  let task = await Task.get(this.db, taskId);

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

  // only running tasks can be resolved, but allow for idempotency if
  // the run is already in the desired state.
  if (run.state !== 'running' && run.state !== target) {
    return res.reportError('RequestConflict',
      'Run {{runId}} of task `{{taskId}}` is not running or {{targetState}}.', {
        taskId,
        runId,
        targetState: target,
      },
    );
  }

  await req.authorize({
    taskId,
    runId,
    workerGroup: run.workerGroup,
    workerId: run.workerId,
  });

  task.updateStatusWith(
    await this.db.fns.resolve_task(taskId, runId, target, target, null));
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
    target,
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
    this.monitor.log.taskCompleted({ taskId, runId });
  } else {
    await this.publisher.taskFailed({
      status,
      runId,
      task: taskPulseContents,
      workerGroup: run.workerGroup,
      workerId: run.workerId,
    }, task.routes);
    this.monitor.log.taskFailed({ taskId, runId });
  }

  return res.reply({ status });
};

/** Report task completed */
builder.declare({
  method: 'post',
  route: '/task/:taskId/runs/:runId/completed',
  name: 'reportCompleted',
  stability: APIBuilder.stability.stable,
  category: 'Worker Interface',
  scopes: 'queue:resolve-task:<taskId>/<runId>',
  input: undefined, // No input at this point
  output: 'task-status-response.yml',
  title: 'Report Run Completed',
  description: [
    'Report a task completed, resolving the run as `completed`.',
  ].join('\n'),
}, function(req, res) {
  let taskId = req.params.taskId;
  let runId = parseInt(req.params.runId, 10);
  // Backwards compatibility with very old workers, should be dropped in the
  // future
  let target = req.body.success === false ? 'failed' : 'completed';

  return resolveTask.call(this, req, res, taskId, runId, target);
});

/** Report task failed */
builder.declare({
  method: 'post',
  route: '/task/:taskId/runs/:runId/failed',
  name: 'reportFailed',
  stability: APIBuilder.stability.stable,
  category: 'Worker Interface',
  scopes: 'queue:resolve-task:<taskId>/<runId>',
  input: undefined, // No input at this point
  output: 'task-status-response.yml',
  title: 'Report Run Failed',
  description: [
    'Report a run failed, resolving the run as `failed`. Use this to resolve',
    'a run that failed because the task specific code behaved unexpectedly.',
    'For example the task exited non-zero, or didn\'t produce expected output.',
    '',
    'Do not use this if the task couldn\'t be run because if malformed',
    'payload, or other unexpected condition. In these cases we have a task',
    'exception, which should be reported with `reportException`.',
  ].join('\n'),
}, function(req, res) {
  let taskId = req.params.taskId;
  let runId = parseInt(req.params.runId, 10);

  return resolveTask.call(this, req, res, taskId, runId, 'failed');
});

/** Report task exception */
builder.declare({
  method: 'post',
  route: '/task/:taskId/runs/:runId/exception',
  name: 'reportException',
  stability: APIBuilder.stability.stable,
  category: 'Worker Interface',
  scopes: 'queue:resolve-task:<taskId>/<runId>',
  input: 'task-exception-request.yml',
  output: 'task-status-response.yml',
  title: 'Report Task Exception',
  description: [
    'Resolve a run as _exception_. Generally, you will want to report tasks as',
    'failed instead of exception. You should `reportException` if,',
    '',
    '  * The `task.payload` is invalid,',
    '  * Non-existent resources are referenced,',
    '  * Declared actions cannot be executed due to unavailable resources,',
    '  * The worker had to shutdown prematurely,',
    '  * The worker experienced an unknown error, or,',
    '  * The task explicitly requested a retry.',
    '',
    'Do not use this to signal that some user-specified code crashed for any',
    'reason specific to this code. If user-specific code hits a resource that',
    'is temporarily unavailable worker should report task _failed_.',
  ].join('\n'),
}, async function(req, res) {
  let taskId = req.params.taskId;
  let runId = parseInt(req.params.runId, 10);
  let reason = req.body.reason;

  let task = await Task.get(this.db, taskId);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound',
      'Task `{{taskId}}` not found. Are you sure it exists?', {
        taskId,
      },
    );
  }

  // Handle cases where the run doesn't exist
  let run = task.runs[runId];
  if (!run) {
    return res.reportError(
      'ResourceNotFound',
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

  // for "infra" issue, we will retry with a specific reason
  let retryReason;
  if (reason === 'worker-shutdown') {
    retryReason = 'retry';
  } else if (reason === 'intermittent-task') {
    retryReason = 'task-retry';
  }

  task.updateStatusWith(
    await this.db.fns.resolve_task(taskId, runId, 'exception', reason, retryReason));

  // Find the run that we (may) have modified
  run = task.runs[runId];

  // If run isn't resolved to exception with reason, we had a conflict
  if (!run ||
      task.runs.length - 1 > runId + 1 ||
      run.state !== 'exception' ||
      run.reasonResolved !== reason) {
    return res.reportError('RequestConflict',
      'Run {{runId}} on task `{{taskId}}` is resolved or not running.', {
        taskId,
        runId,
      },
    );
  }

  let status = task.status();
  let taskPulseContents = {
    tags: task.tags,
  };

  // If a newRun was created and it is a retry with state pending then we better
  // publish messages about it. And if we're not retrying the task, because then
  // the task is resolved as it has no more runs, and we publish a message about
  // task-exception.
  let newRun = task.runs[runId + 1];
  if (newRun &&
      task.runs.length - 1 === runId + 1 &&
      newRun.state === 'pending' &&
      (newRun.reasonCreated === 'retry' ||
       newRun.reasonCreated === 'task-retry')) {
    await Promise.all([
      this.queueService.putPendingMessage(task, runId + 1),
      this.publisher.taskPending({
        status,
        task: taskPulseContents,
        runId: runId + 1,
      }, task.routes),
    ]);
    this.monitor.log.taskPending({ taskId, runId: runId + 1 });
  } else {
    // Update dependency tracker, as the task is resolved (no new run)
    await this.queueService.putResolvedMessage(
      taskId,
      task.taskGroupId,
      task.schedulerId,
      'exception',
    );

    // Publish message about taskException
    await this.publisher.taskException({
      status,
      runId,
      task: taskPulseContents,
      workerGroup: run.workerGroup,
      workerId: run.workerId,
    }, task.routes);
    this.monitor.log.taskException({ taskId, runId });
  }

  // Reply to caller
  return res.reply({ status });
});

// Load artifacts.js so API end-points declared in that file is loaded
require('./artifacts');

/** Get all active provisioners */
builder.declare({
  method: 'get',
  route: '/provisioners',
  query: paginateResults.query,
  name: 'listProvisioners',
  scopes: 'queue:list-provisioners',
  category: 'Worker Metadata',
  stability: APIBuilder.stability.deprecated,
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

  const { rows: provisioners, continuationToken } = await Provisioner.getProvisioners(
    this.db,
    { expires: new Date() },
    { query: { continuationToken: continuation, limit } },
  );

  const result = {
    provisioners: provisioners.map(provisioner => provisioner.serialize()),
  };

  if (continuationToken) {
    result.continuationToken = provisioners.continuationToken;
  }
  return res.reply(result);
});

/** Get a provisioner */
builder.declare({
  method: 'get',
  route: '/provisioners/:provisionerId',
  name: 'getProvisioner',
  scopes: 'queue:get-provisioner:<provisionerId>',
  stability: APIBuilder.stability.deprecated,
  output: 'provisioner-response.yml',
  category: 'Worker Metadata',
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
  const provisioner = await Provisioner.get(this.db, provisionerId, new Date());

  if (!provisioner) {
    return res.reportError('ResourceNotFound',
      'Provisioner `{{provisionerId}}` not found. Are you sure it was created?', {
        provisionerId,
      },
    );
  }

  return res.reply(provisioner.serialize());
});

/** Update a provisioner */
builder.declare({
  method: 'put',
  route: '/provisioners/:provisionerId',
  name: 'declareProvisioner',
  stability: APIBuilder.stability.deprecated,
  category: 'Worker Metadata',
  scopes: { AllOf: [{
    for: 'property',
    in: 'properties',
    each: 'queue:declare-provisioner:<provisionerId>#<property>',
  }] },
  output: 'provisioner-response.yml',
  input: 'update-provisioner-request.yml',
  title: 'Update a provisioner',
  description: [
    'Declare a provisioner, supplying some details about it.',
    '',
    '`declareProvisioner` allows updating one or more properties of a provisioner as long as the required scopes are',
    'possessed. For example, a request to update the `my-provisioner`',
    'provisioner with a body `{description: \'This provisioner is great\'}` would require you to have the scope',
    '`queue:declare-provisioner:my-provisioner#description`.',
    '',
    'The term "provisioner" is taken broadly to mean anything with a provisionerId.',
    'This does not necessarily mean there is an associated service performing any',
    'provisioning activity.',
  ].join('\n'),
}, async function(req, res) {
  const provisionerId = req.params.provisionerId;

  await req.authorize({
    provisionerId,
    properties: Object.keys(req.body),
  });

  const provisioner = await Provisioner.get(this.db, provisionerId, new Date());

  if (!provisioner) {
    return res.reportError('ResourceNotFound',
      'Provisioner `{{provisionerId}}` not found. Are you sure it was created?', {
        provisionerId,
      },
    );
  }

  return res.reply(provisioner.serialize());
});

/** Count pending tasks for workerType */
builder.declare({
  method: 'get',
  route: '/pending/:taskQueueId(*)',
  name: 'pendingTasks',
  scopes: 'queue:pending-count:<taskQueueId>',
  stability: APIBuilder.stability.stable,
  category: 'Worker Metadata',
  output: 'pending-tasks-response.yml',
  title: 'Get Number of Pending Tasks',
  description: [
    'Get an approximate number of pending tasks for the given `taskQueueId`.',
    '',
    'The underlying Azure Storage Queues only promises to give us an estimate.',
    'Furthermore, we cache the result in memory for 20 seconds. So consumers',
    'should be no means expect this to be an accurate number.',
    'It is, however, a solid estimate of the number of pending tasks.',
  ].join('\n'),
}, async function(req, res) {
  const taskQueueId = req.params.taskQueueId;
  const { provisionerId, workerType } = splitTaskQueueId(taskQueueId);

  // Get number of pending message
  let count = await this.queueService.countPendingMessages(taskQueueId);

  // Reply to call with count `pendingTasks`
  return res.reply({
    provisionerId: provisionerId,
    workerType: workerType,
    taskQueueId: taskQueueId,
    pendingTasks: count,
  });
});

/** List worker-types for a given provisioner */
builder.declare({
  method: 'get',
  route: '/provisioners/:provisionerId/worker-types',
  query: paginateResults.query,
  name: 'listWorkerTypes',
  scopes: 'queue:list-worker-types:<provisionerId>',
  category: 'Worker Metadata',
  stability: APIBuilder.stability.deprecated,
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
  // We no longer have a provisioner_id field in the DB, so we have to
  // do the filtering here for now.
  let allTaskQueues = await TaskQueue.getAllTaskQueues(this.db, new Date());
  allTaskQueues = allTaskQueues.filter(tq => {
    const { provisionerId } = splitTaskQueueId(tq.taskQueueId);
    return provisionerId === req.params.provisionerId;
  });

  // Apply pagination on the filtered results
  const { rows: taskQueues, continuationToken } = await paginateResults({
    query: req.query,
    fetch: (size, offset) => allTaskQueues.slice(offset, offset + size),
  });

  const result = {
    workerTypes: taskQueues.map(taskQueue => taskQueue.serialize()),
  };

  if (continuationToken) {
    result.continuationToken = continuationToken;
  }

  result.workerTypes.forEach(addSplitFields);
  return res.reply(result);
});

/** Get a worker-type from a provisioner */
builder.declare({
  method: 'get',
  route: '/provisioners/:provisionerId/worker-types/:workerType',
  name: 'getWorkerType',
  scopes: 'queue:get-worker-type:<provisionerId>/<workerType>',
  stability: APIBuilder.stability.deprecated,
  category: 'Worker Metadata',
  output: 'workertype-response.yml',
  title: 'Get a worker-type',
  description: [
    'Get a worker-type from a provisioner.',
  ].join('\n'),
}, async function(req, res) {
  const { provisionerId, workerType } = req.params;
  const taskQueueId = joinTaskQueueId(provisionerId, workerType);

  const expires = new Date();
  const tQueue = await TaskQueue.get(this.db, taskQueueId, expires);

  if (!tQueue) {
    return res.reportError('ResourceNotFound',
      'Worker-type `{{workerType}}` with Provisioner `{{provisionerId}}` not found. Are you sure it was created?', {
        workerType,
        provisionerId,
      },
    );
  }

  const tqResult = tQueue.serialize();
  addSplitFields(tqResult);

  const actions = [];
  return res.reply(Object.assign({}, tqResult, { actions }));
});

/** Update a worker-type */
builder.declare({
  method: 'put',
  route: '/provisioners/:provisionerId/worker-types/:workerType',
  name: 'declareWorkerType',
  stability: APIBuilder.stability.deprecated,
  category: 'Worker Metadata',
  scopes: { AllOf: [
    {
      for: 'property',
      in: 'properties',
      each: 'queue:declare-worker-type:<provisionerId>/<workerType>#<property>',
    },
  ] },
  output: 'workertype-response.yml',
  input: 'update-workertype-request.yml',
  title: 'Update a worker-type',
  description: [
    'Declare a workerType, supplying some details about it.',
    '',
    '`declareWorkerType` allows updating one or more properties of a worker-type as long as the required scopes are',
    'possessed. For example, a request to update the `highmem` worker-type within the `my-provisioner`',
    'provisioner with a body `{description: \'This worker type is great\'}` would require you to have the scope',
    '`queue:declare-worker-type:my-provisioner/highmem#description`.',
  ].join('\n'),
}, async function(req, res) {
  const { provisionerId, workerType } = req.params;
  const { stability, description, expires } = req.body;
  const taskQueueId = joinTaskQueueId(provisionerId, workerType);

  await req.authorize({
    provisionerId,
    workerType,
    properties: Object.keys(req.body),
  });

  await this.db.fns.task_queue_seen({
    task_queue_id_in: taskQueueId,
    stability_in: stability,
    description_in: description,
    expires_in: expires || taskcluster.fromNow('5 days'),
  });

  const tQueue = await TaskQueue.get(this.db, taskQueueId, new Date());
  const tqResult = tQueue.serialize();
  addSplitFields(tqResult);

  const actions = [];
  return res.reply(Object.assign({}, tqResult, { actions }));
});

/** List task queues */
builder.declare({
  method: 'get',
  route: '/task-queues',
  query: paginateResults.query,
  name: 'listTaskQueues',
  scopes: 'queue:list-task-queues',
  category: 'Worker Metadata',
  stability: APIBuilder.stability.stable,
  output: 'list-taskqueues-response.yml',
  title: 'Get a list of all active task queues',
  description: [
    'Get all active task queues.',
    '',
    'The response is paged. If this end-point returns a `continuationToken`, you',
    'should call the end-point again with the `continuationToken` as a query-string',
    'option. By default this end-point will list up to 1000 task queues in a single',
    'page. You may limit this with the query-string parameter `limit`.',
  ].join('\n'),
}, async function(req, res) {
  const { rows: taskQueues, continuationToken } = await TaskQueue.getTaskQueues(
    this.db,
    { expires: new Date() },
    { query: req.query },
  );

  const result = {
    taskQueues: taskQueues.map(taskQueue => taskQueue.serialize()),
  };

  if (continuationToken) {
    result.continuationToken = continuationToken;
  }

  return res.reply(result);
});

/** Get a task queue */
builder.declare({
  method: 'get',
  route: '/task-queues/:taskQueueId',
  name: 'getTaskQueue',
  scopes: 'queue:get-task-queue:<taskQueueId>',
  stability: APIBuilder.stability.stable,
  category: 'Worker Metadata',
  output: 'taskqueue-response.yml',
  title: 'Get a task queue',
  description: [
    'Get a task queue.',
  ].join('\n'),
}, async function(req, res) {
  const { taskQueueId } = req.params;

  const expires = new Date();
  const tQueue = await TaskQueue.get(this.db, taskQueueId, expires);

  if (!tQueue) {
    return res.reportError('ResourceNotFound',
      'Task queue with `{{taskQueueId}}` not found. Are you sure it was created?', {
        taskQueueId,
      },
    );
  }

  const result = tQueue.serialize();

  return res.reply(result);
});

/** List all active workerGroup/workerId of a workerType */
builder.declare({
  method: 'get',
  route: '/provisioners/:provisionerId/worker-types/:workerType/workers',
  query: {
    ...paginateResults.query,
    quarantined: /^(true|false)$/,
  },
  name: 'listWorkers',
  scopes: 'queue:list-workers:<provisionerId>/<workerType>',
  stability: APIBuilder.stability.deprecated,
  category: 'Worker Metadata',
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
  const quarantined = req.query.quarantined || null;
  const provisionerId = req.params.provisionerId;
  const workerType = req.params.workerType;
  const now = new Date();
  const taskQueueId = joinTaskQueueId(provisionerId, workerType);

  const { rows: workers, continuationToken } = await Worker.getWorkers(
    this.db,
    { taskQueueId },
    { query: req.query },
  );

  const result = {
    workers: workers.filter(worker => {
      let quarantineFilter = true;
      if (quarantined === 'true') {
        quarantineFilter = worker.quarantineUntil >= now;
      } else if (quarantined === 'false') {
        quarantineFilter = worker.quarantineUntil < now;
      }
      // filter out anything that is both expired and not quarantined,
      // so that quarantined workers remain visible even after expiration
      return (worker.expires >= now || worker.quarantineUntil >= now) && quarantineFilter;
    }).map(worker => {
      let entry = {
        workerGroup: worker.workerGroup,
        workerId: worker.workerId,
        firstClaim: worker.firstClaim.toJSON(),
        lastDateActive: worker.lastDateActive?.toJSON(),
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

  if (continuationToken) {
    result.continuationToken = continuationToken;
  }

  return res.reply(result);
});

/** Get a worker from a worker-type */
builder.declare({
  method: 'get',
  route: '/provisioners/:provisionerId/worker-types/:workerType/workers/:workerGroup/:workerId',
  name: 'getWorker',
  scopes: 'queue:get-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>',
  stability: APIBuilder.stability.deprecated,
  output: 'worker-response.yml',
  title: 'Get a worker-type',
  category: 'Worker Metadata',
  description: [
    'Get a worker from a worker-type.',
  ].join('\n'),
}, async function(req, res) {
  const { provisionerId, workerType, workerGroup, workerId } = req.params;
  const taskQueueId = joinTaskQueueId(provisionerId, workerType);

  const now = new Date();
  const [worker, tQueue] = await Promise.all([
    Worker.get(this.db, taskQueueId, workerGroup, workerId, now),
    TaskQueue.get(this.db, taskQueueId, now),
  ]);

  // do not consider workers expired until their quarantine date expires.
  const expired = worker && worker.expires < now && worker.quarantineUntil < now;

  if (expired || !worker || !tQueue) {
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

  const workerResult = worker.serialize();
  addSplitFields(workerResult);

  const actions = [];
  return res.reply(Object.assign({}, workerResult, { actions }));
});

/** Quarantine a Worker */
builder.declare({
  method: 'put',
  route: '/provisioners/:provisionerId/worker-types/:workerType/workers/:workerGroup/:workerId',
  name: 'quarantineWorker',
  stability: APIBuilder.stability.experimental,
  category: 'Worker Metadata',
  scopes: { AllOf: [
    'queue:quarantine-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>',
  ] },
  input: 'quarantine-worker-request.yml',
  output: 'worker-response.yml',
  title: 'Quarantine a worker',
  description: [
    'Quarantine a worker',
  ].join('\n'),
}, async function(req, res) {
  const { provisionerId, workerType, workerGroup, workerId } = req.params;
  const { quarantineUntil } = req.body;
  const taskQueueId = joinTaskQueueId(provisionerId, workerType);

  const [result] = await this.db.fns.quarantine_queue_worker_with_last_date_active({
    task_queue_id_in: taskQueueId,
    worker_group_in: workerGroup,
    worker_id_in: workerId,
    quarantine_until_in: quarantineUntil,
  });

  if (!result) {
    return res.reportError('ResourceNotFound',
      'Worker with workerId `{{workerId}}`, workerGroup `{{workerGroup}}`,' +
      'worker-type `{{workerType}}` and provisionerId `{{provisionerId}}` not found.', {
        workerId,
        workerGroup,
        workerType,
        provisionerId,
      },
    );
  }
  const worker = Worker.fromDb(result);

  const workerResult = worker.serialize();
  addSplitFields(workerResult);

  const actions = [];
  return res.reply(Object.assign({}, workerResult, { actions }));
});

/** Update a worker */
builder.declare({
  method: 'put',
  route: '/provisioners/:provisionerId/worker-types/:workerType/:workerGroup/:workerId',
  name: 'declareWorker',
  stability: APIBuilder.stability.experimental,
  category: 'Worker Metadata',
  scopes: { AllOf: [
    {
      for: 'property',
      in: 'properties',
      each: 'queue:declare-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>#<property>',
    },
  ] },
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
  const { provisionerId, workerType, workerGroup, workerId } = req.params;
  const { expires } = req.body;
  const taskQueueId = joinTaskQueueId(provisionerId, workerType);

  await req.authorize({
    provisionerId,
    workerType,
    workerGroup,
    workerId,
    properties: Object.keys(req.body),
  });

  await this.db.fns.task_queue_seen({
    task_queue_id_in: taskQueueId,
    expires_in: expires,
    description_in: null,
    stability_in: null,
  });
  await this.db.fns.queue_worker_seen_with_last_date_active({
    task_queue_id_in: taskQueueId,
    worker_group_in: workerGroup,
    worker_id_in: workerId,
    expires_in: expires,
  });

  const worker = await Worker.get(this.db, taskQueueId, workerGroup, workerId, new Date());

  const workerResult = worker.serialize();
  addSplitFields(workerResult);

  const actions = [];
  return res.reply(Object.assign({}, workerResult, { actions }));
});

builder.declare({
  method: 'get',
  route: '/__heartbeat__',
  name: 'heartbeat',
  scopes: null,
  category: 'Monitoring',
  stability: 'stable',
  title: 'Heartbeat',
  description: [
    'Respond with a service heartbeat.',
    '',
    'This endpoint is used to check on backing services this service',
    'depends on.',
  ].join('\n'),
}, function(_req, res) {
  // TODO: add implementation
  res.reply({});
});
