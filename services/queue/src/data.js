let Entity  = require('azure-entities');
let debug   = require('debug')('app:data');
let assert  = require('assert');
let Promise = require('promise');
let _       = require('lodash');

/** Entity for tracking tasks and associated state */
let Task = Entity.configure({
  version:          1,
  partitionKey:     Entity.keys.StringKey('taskId'),
  rowKey:           Entity.keys.ConstantKey('task'),
  properties: {
    taskId:         Entity.types.SlugId,
    provisionerId:  Entity.types.String,
    workerType:     Entity.types.String,
    schedulerId:    Entity.types.String,
    taskGroupId:    Entity.types.SlugId,
    /** List of custom routes as strings */
    routes:         Entity.types.JSON,
    retries:        Entity.types.Number,
    retriesLeft:    Entity.types.Number,
    created:        Entity.types.Date,
    deadline:       Entity.types.Date,
    expires:        Entity.types.Date,
    /** List of scopes as strings */
    scopes:         Entity.types.JSON,
    payload:        Entity.types.JSON,
    /**
     * Meta-data object with properties:
     * - name
     * - description
     * - owner
     * - source
     * See JSON schema for documentation.
     */
    metadata:       Entity.types.JSON,
    /** Tags as mapping from tag-key to tag-value as string */
    tags:           Entity.types.JSON,
    extra:          Entity.types.JSON,
    /**
     * List of run objects with the following keys:
     * - state          (required)
     * - reasonCreated  (required)
     * - reasonResolved (required)
     * - workerGroup
     * - workerId
     * - takenUntil
     * - scheduled
     * - started
     * - resolved
     * See schema for task status structure for details.
     * Remark that `runId` always match the index in the array.
     */
    runs:           Entity.types.JSON,
    /** Time at which claim to latest run expires, new Date(0) if none */
    takenUntil:     Entity.types.Date,
  },
}).configure({
  version:          2,
  properties: {
    taskId:         Entity.types.SlugId,
    provisionerId:  Entity.types.String,
    workerType:     Entity.types.String,
    schedulerId:    Entity.types.String,
    taskGroupId:    Entity.types.SlugId,
    /** List of custom routes as strings */
    routes:         Entity.types.JSON,
    priority:       Entity.types.String,
    retries:        Entity.types.Number,
    retriesLeft:    Entity.types.Number,
    created:        Entity.types.Date,
    deadline:       Entity.types.Date,
    expires:        Entity.types.Date,
    /** List of scopes as strings */
    scopes:         Entity.types.JSON,
    payload:        Entity.types.JSON,
    /**
     * Meta-data object with properties:
     * - name
     * - description
     * - owner
     * - source
     * See JSON schema for documentation.
     */
    metadata:       Entity.types.JSON,
    /** Tags as mapping from tag-key to tag-value as string */
    tags:           Entity.types.JSON,
    extra:          Entity.types.JSON,
    /**
     * List of run objects with the following keys:
     * - state          (required)
     * - reasonCreated  (required)
     * - reasonResolved (required)
     * - workerGroup
     * - workerId
     * - takenUntil
     * - scheduled
     * - started
     * - resolved
     * See schema for task status structure for details.
     * Remark that `runId` always match the index in the array.
     */
    runs:           Entity.types.JSON,
    /** Time at which claim to latest run expires, new Date(0) if none */
    takenUntil:     Entity.types.Date,
  },
  migrate(item) {
    item.priority = 'normal';
    return item;
  },
}).configure({
  version:              3,
  properties: {
    taskId:             Entity.types.SlugId,
    provisionerId:      Entity.types.String,
    workerType:         Entity.types.String,
    schedulerId:        Entity.types.String,
    taskGroupId:        Entity.types.SlugId,
    dependencies:       Entity.types.JSON,
    requires:           Entity.types.String,
    /** List of custom routes as strings */
    routes:             Entity.types.JSON,
    priority:           Entity.types.String,
    retries:            Entity.types.Number,
    retriesLeft:        Entity.types.Number,
    created:            Entity.types.Date,
    deadline:           Entity.types.Date,
    expires:            Entity.types.Date,
    /** List of scopes as strings */
    scopes:             Entity.types.JSON,
    payload:            Entity.types.JSON,
    /**
     * Meta-data object with properties:
     * - name
     * - description
     * - owner
     * - source
     * See JSON schema for documentation.
     */
    metadata:           Entity.types.JSON,
    /** Tags as mapping from tag-key to tag-value as string */
    tags:               Entity.types.JSON,
    extra:              Entity.types.JSON,
    /**
     * List of run objects with the following keys:
     * - state          (required)
     * - reasonCreated  (required)
     * - reasonResolved (required)
     * - workerGroup
     * - workerId
     * - hintId         (optional)
     * - takenUntil
     * - scheduled
     * - started
     * - resolved
     * See schema for task status structure for details.
     * Remark that `runId` always match the index in the array.
     */
    runs:               Entity.types.JSON,
    /** Time at which claim to latest run expires, new Date(0) if none */
    takenUntil:         Entity.types.Date,
  },
  migrate(item) {
    item.dependencies = [];
    item.requires = 'all-completed';
    return item;
  },
}).configure({
  version:              4,
  properties: {
    taskId:             Entity.types.SlugId,
    provisionerId:      Entity.types.String,
    workerType:         Entity.types.String,
    schedulerId:        Entity.types.String,
    taskGroupId:        Entity.types.SlugId,
    dependencies:       Entity.types.JSON,
    requires:           Entity.types.String,
    /** List of custom routes as strings */
    routes:             Entity.types.JSON,
    priority:           Entity.types.String,
    retries:            Entity.types.Number,
    retriesLeft:        Entity.types.Number,
    created:            Entity.types.Date,
    deadline:           Entity.types.Date,
    expires:            Entity.types.Date,
    /** List of scopes as strings */
    scopes:             Entity.types.JSON,
    payload:            Entity.types.JSON,
    /**
     * Meta-data object with properties:
     * - name
     * - description
     * - owner
     * - source
     * See JSON schema for documentation.
     */
    metadata:           Entity.types.JSON,
    /** Tags as mapping from tag-key to tag-value as string */
    tags:               Entity.types.JSON,
    extra:              Entity.types.JSON,
    /**
     * List of run objects with the following keys:
     * - state          (required)
     * - reasonCreated  (required)
     * - reasonResolved (required)
     * - workerGroup
     * - workerId
     * - hintId         (optional)
     * - takenUntil
     * - scheduled
     * - started
     * - resolved
     * See schema for task status structure for details.
     * Remark that `runId` always match the index in the array.
     */
    runs:               Entity.types.JSON,
    /** Time at which claim to latest run expires, new Date(0) if none */
    takenUntil:         Entity.types.Date,
  },
  migrate(item) {
    if (item.priority === 'normal') {
      item.priority = 'lowest';
    }
    return item;
  },
});

/** Return promise for the task definition */
Task.prototype.definition = function() {
  return Promise.resolve({
    provisionerId:  this.provisionerId,
    workerType:     this.workerType,
    schedulerId:    this.schedulerId,
    taskGroupId:    this.taskGroupId,
    dependencies:   _.cloneDeep(this.dependencies),
    requires:       this.requires,
    routes:         _.cloneDeep(this.routes),
    priority:       this.priority,
    retries:        this.retries,
    created:        this.created.toJSON(),
    deadline:       this.deadline.toJSON(),
    expires:        this.expires.toJSON(),
    scopes:         _.cloneDeep(this.scopes),
    payload:        _.cloneDeep(this.payload),
    metadata:       _.cloneDeep(this.metadata),
    tags:           _.cloneDeep(this.tags),
    extra:          _.cloneDeep(this.extra),
  });
};

/** Construct task status structure */
Task.prototype.status = function() {
  return {
    taskId:           this.taskId,
    provisionerId:    this.provisionerId,
    workerType:       this.workerType,
    schedulerId:      this.schedulerId,
    taskGroupId:      this.taskGroupId,
    deadline:         this.deadline.toJSON(),
    expires:          this.expires.toJSON(),
    retriesLeft:      this.retriesLeft,
    state:            this.state(),
    runs:             this.runs.map((run, runId) => {
      return _.defaults({runId}, _.pick(run, [
        'state',
        'reasonCreated',
        'reasonResolved',
        'workerGroup',
        'workerId',
        'takenUntil',
        'scheduled',
        'started',
        'resolved',
      ]));
    }),
  };
};

/** Get state of latest run, or 'unscheduled' if no runs */
Task.prototype.state = function() {
  return (_.last(this.runs) || {state: 'unscheduled'}).state;
};

/**
 * Test if there is a claim to task stored in `task.claim`
 *
 * Please, note that the claim may still be timed out and invalid.
 */
Task.prototype.hasClaim = function() {
  return this.claim && this.claim.messageId && this.claim.receipt;
};

/**
 * Expire tasks that are past their expiration.
 *
 * Returns a promise that all expired tasks have been deleted
 */
Task.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  var count = 0;
  await Entity.scan.call(this, {
    expires:          Entity.op.lessThan(now),
  }, {
    limit:            250, // max number of concurrent delete operations
    handler:          (task) => { count++; return task.remove(true); },
  });
  return count;
};

// Export Task
exports.Task = Task;

/** Entity for tracking artifacts */
let Artifact = Entity.configure({
  version:          1,
  partitionKey:     Entity.keys.CompositeKey('taskId', 'runId'),
  rowKey:           Entity.keys.StringKey('name'),
  properties: {
    taskId:         Entity.types.SlugId,
    runId:          Entity.types.Number,
    name:           Entity.types.String,
    storageType:    Entity.types.String,
    contentType:    Entity.types.String,
    /**
     * Location details storageType,
     *
     * storageType: s3
     *   bucket:        S3 bucket that contains the object
     *   prefix:        Prefix (path) for the object within the bucket
     *
     * storageType: azure
     *   container:     Azure container that holds the blob
     *   path:          Path to blob within container
     *
     * storageType: reference
     *   url:           URL that artifact should redirect to
     *
     * storageType: error
     *   reason:        Formalized reason for error artifact, see JSON schema.
     *   message:       Human readable error message to return
     */
    details:        Entity.types.JSON,
    expires:        Entity.types.Date,
  },
  context: [
    'blobStore',      // BlobStore instance wrapping Azure Blob Storage
    'privateBucket',  // Private artifact bucket wrapping S3
    'publicBucket',   // Public artifact bucket wrapping S3
    'monitor',        // base.monitor instance
  ],
});

/** Return JSON representation of artifact meta-data */
Artifact.prototype.json = function() {
  return {
    storageType:      this.storageType,
    name:             this.name,
    expires:          this.expires.toJSON(),
    contentType:      this.contentType,
  };
};

/**
 * Remove underlying artifact and entity representing it.
 *
 * Warning, unlike Entity.remove which this method overwrites, this method will
 * remove both entity and underlying artifact regardless of any changes. But
 * the Entity will not be deleted if there is an error deleting the underlying
 * artifact.
 */
Artifact.prototype.remove = function(ignoreError) {
  // Promise that deleted underlying artifact, and keep reference to context
  var deleted = Promise.resolve();

  // Handle S3 artifacts
  if (this.storageType === 's3') {
    debug('Deleting expired s3 artifact from bucket: %s, prefix: %s',
          this.details.bucket, this.details.prefix);
    // Delete the right bucket
    if (this.details.bucket === this.publicBucket.bucket) {
      deleted = this.publicBucket.deleteObject(this.details.prefix);
    } else if (this.details.bucket === this.privateBucket.bucket) {
      deleted = this.privateBucket.deleteObject(this.details.prefix);
    } else {
      let err = new Error('Expiring artifact with bucket which isn\'t ' +
                          'configured for use. Please investigate!');
      err.bucket  = this.details.bucket;
      err.taskId  = this.taskId;
      err.runId   = this.runId;
      this.monitor.reportError(err);
      return;
    }
  }

  // Handle azure artifact
  if (this.storageType === 'azure') {
    debug('Deleting expired azure artifact from container: %s, path: %s',
          this.details.container, this.details.path);
    // Validate that this is the configured container
    if (this.details.container !== this.blobStore.container) {
      let err = new Error('Expiring artifact with container which isn\'t ' +
                          'configured for use. Please investigate!');
      err.container = this.details.container;
      err.taskId    = this.taskId;
      err.runId     = this.runId;
      this.monitor.reportError(err);
      return;
    }
    deleted = this.blobStore.deleteBlob(this.details.path, true);
  }

  // When underlying artifact is deleted (if any underlying artifact exists)
  // we delete the artifact Entity.
  return deleted.then(() => {
    // Delete entity, if underlying resource was successfully deleted
    return Entity.prototype.remove.call(this, true, true);
  }, err => {
    debug('WARNING: Failed to delete expired artifact: %j, details: %j ' +
          'from taskId: %s, runId: %s with error: %s, as JSON: %j',
          this.json(), this.details, this.taskId, this.runId, err, err);
    // Rethrow error, if we're not supposed to ignore it.
    if (!ignoreError) {
      throw err;
    }
  });
};

/**
 * Expire artifacts that are past their expiration.
 *
 * Returns a promise that all expired artifacts have been deleted
 */
Artifact.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  var count = 0;
  await Entity.scan.call(this, {
    expires:          Entity.op.lessThan(now),
  }, {
    limit:            250, // max number of concurrent delete operations
    handler:          (item) => { count++; return item.remove(true); },
  });
  return count;
};

// Export Artifact
exports.Artifact = Artifact;

/**
 * Entity for tracking task-group existence
 * Ensuring that all tasks in a task-group has the same schedulerId.
 */
let TaskGroup = Entity.configure({
  version:          1,
  partitionKey:     Entity.keys.StringKey('taskGroupId'),
  rowKey:           Entity.keys.ConstantKey('task-group'),
  properties: {
    taskGroupId:    Entity.types.SlugId,
    schedulerId:    Entity.types.String,
    // Expiration date when this entry can be deleted
    // When adding a task we will update this to task.expires + 72 hours
    // if taskGroup.expires < task.expires. This way the taskGroup entity
    // won't be updated 100 times if we submit 100 tasks sequentially, with
    // slightly higher expiration.
    expires:        Entity.types.Date,
  },
});

/**
 * Expire task-groups that are past their expiration.
 *
 * Returns a promise that all expired task-groups have been deleted
 */
TaskGroup.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  var count = 0;
  await Entity.scan.call(this, {
    expires:          Entity.op.lessThan(now),
  }, {
    limit:            250, // max number of concurrent delete operations
    handler:          (taskGroup) => {
      count++;
      return taskGroup.remove(true);
    },
  });
  return count;
};

// Export TaskGroup
exports.TaskGroup = TaskGroup;

/**
 * Entity registering a task as member of a task-group.
 *
 * Existence of this entity only carries value if the task also exists and has
 * the taskId and taskGroupId given here.
 */
let TaskGroupMember = Entity.configure({
  version:          1,
  partitionKey:     Entity.keys.StringKey('taskGroupId'),
  rowKey:           Entity.keys.StringKey('taskId'),
  properties: {
    taskGroupId:    Entity.types.SlugId,
    taskId:         Entity.types.SlugId,
    expires:        Entity.types.Date,
  },
});

/**
 * Expire task-group memberships that are past their expiration.
 *
 * Returns a promise that all expired task-group memberships have been deleted
 */
TaskGroupMember.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  var count = 0;
  await Entity.scan.call(this, {
    expires:          Entity.op.lessThan(now),
  }, {
    limit:            250, // max number of concurrent delete operations
    handler:          (member) => { count++; return member.remove(true); },
  });
  return count;
};

// Export TaskGroupMember
exports.TaskGroupMember = TaskGroupMember;

/**
 * TaskRequirement is relation from tasks to dependencies.
 *
 * An entry {taskId, requiredTaskId} implies that taskId is blocked on
 * requiredTaskId.
 *
 * Hence, dependencies from taskId contains requiredTaskId.
 *
 * This is the same relation as TaskRequirement, except it is in the other
 * direction. This relation is used to track if dependencies have been
 * satisfied. This is tracked by deleting satisfied entries, when no entries
 * remains for taskId, the task must be scheduled.
 */
let TaskRequirement = Entity.configure({
  version:            1,
  partitionKey:       Entity.keys.StringKey('taskId'),
  rowKey:             Entity.keys.StringKey('requiredTaskId'),
  properties: {
    taskId:           Entity.types.SlugId,
    requiredTaskId:   Entity.types.SlugId,
    expires:          Entity.types.Date,
  },
});

/**
 * Expire TaskRequirement entries.
 *
 * Returns a promise that all expired TaskRequirement entries have been deleted
 */
TaskRequirement.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  var count = 0;
  await Entity.scan.call(this, {
    expires:          Entity.op.lessThan(now),
  }, {
    limit:            250, // max number of concurrent delete operations
    handler:          entry => { count++; return entry.remove(true); },
  });
  return count;
};

// Export TaskRequirement
exports.TaskRequirement = TaskRequirement;

/**
 * TaskDependency is a relation from tasks to task dependents.
 *
 * An entry {taskId, dependentTaskId} implies that dependentTaskId depends on
 * taskId.
 *
 * Hence, dependencies from dependentTaskId contains taskId.
 *
 * This is the same relation as TaskRequirement, except it is in the other
 * direction. This relation is used to find tasks to consider for scheduling
 * when taskId is resolved.
 */
let TaskDependency = Entity.configure({
  version:            1,
  partitionKey:       Entity.keys.StringKey('taskId'),
  rowKey:             Entity.keys.StringKey('dependentTaskId'),
  properties: {
    taskId:           Entity.types.SlugId,
    dependentTaskId:  Entity.types.SlugId,
    // require is 'completed' or 'resolved' from task.requires
    require:          Entity.types.String,
    expires:          Entity.types.Date,
  },
});

/**
 * Expire TaskDependency entries.
 *
 * Returns a promise that all expired TaskDependency entries have been deleted
 */
TaskDependency.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  var count = 0;
  await Entity.scan.call(this, {
    expires:          Entity.op.lessThan(now),
  }, {
    limit:            250, // max number of concurrent delete operations
    handler:          entry => { count++; return entry.remove(true); },
  });
  return count;
};

// Export TaskDependency
exports.TaskDependency = TaskDependency;

/**
 * Provisioner describes provisioners (construed broadly - a provisionerId doesn't
 * necessarily correspond to a running service).
 *
 */
let Provisioner = Entity.configure({
  version:            1,
  partitionKey:       Entity.keys.StringKey('provisionerId'),
  rowKey:             Entity.keys.ConstantKey('provisioner'),
  properties: {
    provisionerId:    Entity.types.String,
    // the time at which this provisioner should no longer be displayed
    expires:          Entity.types.Date,
  },
});

/**
 * Expire Provisioner entries.
 *
 * Returns a promise that all expired Provisioner entries have been deleted
 */
Provisioner.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  let count = 0;

  await Entity.scan.call(this, {
    expires:          Entity.op.lessThan(now),
  }, {
    limit:            250, // max number of concurrent delete operations
    handler:          entry => { count++; return entry.remove(true); },
  });

  return count;
};

/** Return JSON representation of provisioner meta-data */
Provisioner.prototype.json = function() {
  return {
    provisionerId:    this.provisionerId,
  };
};

// Export Provisioner
exports.Provisioner = Provisioner;

/**
 * Entity for tracking worker-types.
 */
let WorkerType = Entity.configure({
  version:            1,
  partitionKey:       Entity.keys.StringKey('provisionerId'),
  rowKey:             Entity.keys.StringKey('workerType'),
  properties: {
    provisionerId:    Entity.types.String,
    workerType:       Entity.types.String,
    // the time at which this worker-type should no longer be displayed
    expires:          Entity.types.Date,
  },
});

/**
 * Expire WorkerType entries.
 *
 * Returns a promise that all expired WorkerType entries have been deleted
 */
WorkerType.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  let count = 0;

  await Entity.scan.call(this, {
    expires:          Entity.op.lessThan(now),
  }, {
    limit:            250, // max number of concurrent delete operations
    handler:          entry => { count++; return entry.remove(true); },
  });

  return count;
};

// Export WorkerType
exports.WorkerType = WorkerType;

/**
 * Entity for tracking workers.
 */
let Worker = Entity.configure({
  version:            1,
  partitionKey:       Entity.keys.CompositeKey('provisionerId', 'workerType'),
  rowKey:             Entity.keys.CompositeKey('workerGroup', 'workerId'),
  properties: {
    provisionerId:    Entity.types.String,
    workerType:       Entity.types.String,
    workerGroup:      Entity.types.String,
    workerId:         Entity.types.String,
    // the time at which this worker should no longer be displayed
    expires:          Entity.types.Date,
  },
});

/**
 * Expire Worker entries.
 *
 * Returns a promise that all expired Worker entries have been deleted
 */
Worker.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  let count = 0;

  await Entity.scan.call(this, {
    expires:          Entity.op.lessThan(now),
  }, {
    limit:            250, // max number of concurrent delete operations
    handler:          entry => { count++; return entry.remove(true); },
  });

  return count;
};

exports.Worker = Worker;
