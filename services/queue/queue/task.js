var slugid  = require('slugid');
var Promise = require('promise');
var debug   = require('debug')('queue:db');
var Knex    = require('knex');
var assert  = require('assert');
var _       = require('lodash');
var util    = require('util');

// Task fields
var TASK_FIELDS = [
  // Primary key
  'taskId',

  // Task environment information
  'provisionerId',
  'workerType',

  // Scheduler information
  'schedulerId',
  'taskGroupId',

  // Ćreation time
  'created',

  // Task expiry details
  'deadline',
  'retriesLeft',

  // Task-specific routes
  'routes',

  // Meta-data possibly for authentication
  'owner',
];

// Fields on a run
var RUN_FIELDS = [
  // Primary Key
  'taskId',
  'runId',
  'state',

  // Status information
  'reasonCreated',
  'reasonResolved',
  'success',

  // Run-time information
  'workerGroup',
  'workerId',
  'takenUntil',

  // Statistics
  'scheduled',
  'started',
  'resolved'
];

// Fields that holds dates
var TASK_DATE_FIELDS  = ['created', 'deadline'];
var RUN_DATE_FIELDS   = ['takenUntil', 'scheduled', 'started', 'resolved'];

var TASK_JSON_FIELDS  = ['routes'];

/** Create database instance */
var Task = function(rowInfo) {
  _.assign(this, rowInfo.taskRow);
  this.taskId       = slugid.encode(this.taskId);
  this.taskGroupId  = slugid.encode(this.taskGroupId);
  this.routes       = JSON.parse(this.routes);
  this.runs         = _.sortBy(rowInfo.runRows, 'runId');
  this.runs.forEach(function(run) {
    run.taskId = slugid.encode(run.taskId);
  });
};

/**
 * Configure a Task subclass to have a database connection
 *
 * options:
 * {
 *   client:           'postgres', // knex database client
 *   connectionString: 'pg://...'  // database connection string
 * }
 */
Task.configure = function(options) {
  // Identify the parent class, that is always `this` so we can use it on
  // subclasses
  var Parent = this;

  // Create a subclass of Parent
  var subClass = function(entity) {
    // Always pass down the entity we're initializing from
    Parent.call(this, entity);
  };
  util.inherits(subClass, Parent);

  // Inherit class methods too (static members in C++)
  _.assign(subClass, Parent);

  // Initialize with default options
  options = _.defaults(options || {}, {
    client:       'postgres'
  });

  // Validate options
  assert(options.connectionString, "A database 'connectionString' is required");

  // Create knex on subclass
  subClass._knex = Knex({
    client:       options.client,
    connection:   options.connectionString
  });

  return subClass;
};

// Export Task
module.exports = Task;

/** Create tables if they don't exist */
Task.ensureTables = function() {
  var knex = this._knex;
  return knex.transaction(function(transaction) {
    return Promise.resolve().then(function() {
      return transaction.schema.hasTable('tasks');
    }).then(function(exists) {
      // If tasks table exists, skip creation
      if (exists) {
        return debug("'tasks' table exists");
      }
      // Create tasks table
      debug("Creating 'tasks' table");
      return transaction.schema.createTable('tasks', function(table) {
        // Primary key
        table.uuid('taskId')
             .notNullable()
             .primary();

        // Task environment information
        table.string('provisionerId', 22).notNullable();
        table.string('workerType', 22).notNullable();

        // Scheduler information
        table.string('schedulerId', 22).notNullable();
        table.uuid('taskGroupId').notNullable();

        // Creation time
        table.timestamp('created').notNullable();

        // Task expiry details
        table.timestamp('deadline').notNullable();
        table.integer('retriesLeft').notNullable();

        // Task-specific routes
        table.text('routes').notNullable();

        // Meta-data possibly for authentication
        table.string('owner', 255).notNullable();
      });
    }).then(function() {
      return transaction.schema.hasTable('runs');
    }).then(function(exists) {
      // If runs table exists, skip creation
      if (exists) {
        return debug("'runs' table exists");
      }
      // Create runs table
      debug("Creating 'runs' table")
      return transaction.schema.createTable('runs', function(table) {
        // Composite primary key
        table.uuid('taskId')
             .notNullable()
             .references('taskId')
             .inTable('tasks')
             .onDelete('cascade');
        table.integer('runId')
             .notNullable();
        table.primary(['taskId', 'runId']);

        // Status information
        table.string('state', 255).notNullable();
        table.string('reasonCreated', 255).notNullable();
        table.string('reasonResolved', 255).nullable();
        table.boolean('success').nullable();

        // Run-time information
        table.string('workerGroup', 255).nullable();
        table.string('workerId', 22).nullable();
        table.timestamp('takenUntil').nullable();

        // Statistics
        table.timestamp('scheduled').notNullable();
        table.timestamp('started').nullable();
        table.timestamp('resolved').nullable();
      });
    });
  });
};



/** Delete all tables if they exist */
Task.dropTables = function() {
  // runs must be dropped first... if we used postgres schemas this would be
  // easier but remove the benefits of using knex.
  var knex = this._knex;
  debug("Dropping tables");
  return knex.schema.dropTableIfExists('runs').then(function() {
    return knex.schema.dropTableIfExists('tasks');
  });
};

/** Close connection pooling allowing the process to terminate */
Task.close = function() {
  return this._knex.destroy().then(function() {
    debug("Terminate knex connection pool");
  });
};

// Decode the slugid
var deslug = function(id) {
  return slugid.decode(id);
};

/**
 * Extract task row and run rows
 *
 * See `Task.create` for taskInfo format. We have version field so that we can
 * load old data from permanent storage going forward.
 */
var loadTaskInfo = function(taskInfo) {
  assert(taskInfo.version === 1,
         "Unknown taskInfo version: %s", taskInfo.version);

  // Extract task row
  var taskRow = TASK_FIELDS.reduce(function(row, field) {
    row[field] = taskInfo[field];
    return row;
  }, {});
  TASK_DATE_FIELDS.forEach(function(field) {
    if (taskRow[field] !== null && taskRow[field] !== undefined) {
      taskRow[field] = new Date(taskRow[field]);
    }
  });
  TASK_JSON_FIELDS.forEach(function(field) {
    taskRow[field] = JSON.stringify(taskRow[field]);
  });
  // Decode slugid to uuids
  var taskId = taskRow.taskId = deslug(taskInfo.taskId);
  taskRow.taskGroupId         = deslug(taskRow.taskGroupId);

  // Extract run rows
  var runRows = taskInfo.runs.map(function(runInfo) {
    var runRow = RUN_FIELDS.filter(function(field) {
      return field !== 'taskId';
    }).reduce(function(row, field) {
      row[field] = runInfo[field];
      return row;
    }, {taskId: taskId});
    RUN_DATE_FIELDS.forEach(function(field) {
      if (runRow[field] !== null && runRow[field] !== undefined) {
        runRow[field] = new Date(runRow[field]);
      }
    });
    return runRow
  });

  // Return extracted rows
  return {
    taskRow:  taskRow,
    runRows:  runRows
  };
};

// Add a transaction as last argument, if an argument is missing,
// please not that this relies on Function.prototype.length, so it can't wrap
// wrapper functions
var transacting = function (f) {
  return function() {
    var that = this;
    var args = Array.prototype.slice.call(arguments, 0);
    if (!args[f.length - 1]) {
      return that._knex.transaction(function(t) {
        args[f.length - 1] = t;
        return f.apply(that, args);
      });
    }
    return f.apply(that, args);
  };
};


/** Create task and runs from taskInfo object
 *
 * taskInfo: {
 *   version:        1,  // Version of the taskInfo object
 *   taskId:             // TaskId in slugid format
 *   provisionerId:      // provisionerId
 *   workerType:         // workerType
 *   schedulerId:        // schedulerId
 *   taskGroupId:        // taskGroupId
 *   created:            // Date object as JSON
 *   deadline:           // Date object as JSON
 *   retriesLeft:        // Number of retries left
 *   routes:             // routes from task definition
 *   owner:              // owner email from task definition
 *   runs: [{
 *     runId:            // RunId starting from 0
 *     state:            // pending | running | completed | failed
 *     reasonCreated:    // new-task | retry | rerun
 *     reasonResolved:   // null | completed | deadline-exceeded | canceled | claim-expired
 *     success:          // true | false | null
 *     workerGroup:      // workerGroup or null
 *     workerId:         // workerId or null
 *     takenUntil:       // Date object as JSON or null
 *     scheduled:        // Date object as JSON
 *     started:          // Date object as JSON or null
 *     resolved:         // Date object as JSON or null
 *   }]
 * }
 */
Task.create = transacting(function(taskInfo, loadIfExists, knex) {
  // Load task if requested to test this
  var doInsertIt = Promise.resolve(null);
  if (loadIfExists) {
    doInsertIt = Task.load(taskInfo.taskId, knex);
  }
  return doInsertIt.then(function(task) {
    // if the task exists and we were requested not to error on existence
    if (task && loadIfExists) {
      return task;
    }
    // Find rows and insert them
    var rowInfo = loadTaskInfo(taskInfo);
    return knex
            .insert(rowInfo.taskRow)
            .into('tasks')
            .then(function() {
      if (rowInfo.runRows.length !== 0) {
        return knex
                .insert(rowInfo.runRows)
                .into('runs');
      }
    }).then(function() {
      // Load the task object inserted
      return Task.load(taskInfo.taskId, knex);
    });
  }).then(function(task) {
    assert(task, "Task object was just inserted, it must exist!");
    return task;
  });
});

/** Ensure that a task is scheduled, returns a promise for the task */
Task.schedule = transacting(function(taskId, knex) {
  var that = this;
  return that.load(taskId, knex).then(function(task) {
    // If we have runs then it's already scheduled
    if (task.runs.length > 0) {
      return task;
    }
    // If not then we need to add one pending run
    return knex
            .insert({
              taskId:         deslug(taskId),
              runId:          0,
              state:          'pending',
              reasonCreated:  'scheduled',
              scheduled:      new Date()
            })
            .into('runs')
            .then(function() {
      return that.load(taskId, knex);
    });
  }).then(function(task) {
    assert(task.runs.length > 0, "Task object should have runs");
    return task;
  });
});


var TASK_FIELDS_ALIASING = TASK_FIELDS.map(function(field) {
  return 'tasks.' + field + ' as tasks:' + field;
});
var RUN_FIELDS_ALIASING = RUN_FIELDS.map(function(field) {
  return 'runs.' + field + ' as runs:' + field;
});
// Remove aliasing from task row
var dealiasTaskRow = function(row) {
  return TASK_FIELDS.reduce(function(taskRow, field) {
    taskRow[field] = row['tasks:' + field];
    return taskRow;
  }, {});
};
// Remove aliasing from run
var dealiasRunRow = function(row) {
  return RUN_FIELDS.reduce(function(runRow, field) {
    runRow[field] = row['runs:' + field];
    return runRow;
  }, {});
};

/** Load task status from database, null if not found */
Task.load = transacting(function(taskId, knex) {
  var Class = this;
  return knex
      .select(TASK_FIELDS_ALIASING.concat(RUN_FIELDS_ALIASING))
      .from('tasks')
      .leftOuterJoin('runs', 'tasks.taskId', 'runs.taskId')
      .where('tasks.taskId', deslug(taskId))
      .orderBy('runs.runId')
      .then(function(rows) {
    // Return null if failed to load
    if (rows.length === 0) {
      return null;
    }
    // Find task row and run rows
    var taskRow = dealiasTaskRow(rows[0]);
    var runRows = rows.filter(function(row) {
      return row['runs:runId'] !== null;
    }).map(dealiasRunRow);

    // Create Task subclass instance
    return new Class({
      taskRow: taskRow,
      runRows: runRows
    });
  });
});

/**
 * Query pending tasks for a given provisionerId
 *
 * This just returns a list of taskIds.
 */
Task.queryPending = transacting(function(provisionerId, knex) {
  var Class = this;
  return knex
    .distinct('tasks.taskId')
    .select()
    .from('tasks')
    .leftOuterJoin('runs', 'tasks.taskId', 'runs.taskId')
    .where({
      'tasks.provisionerId':  provisionerId,
      'runs.state':           'pending'
    }).then(function(tasks) {
      return tasks.map(function(task) {
        return slugid.encode(task.taskId);
      });
    });
});


/**
 * Claim a run for the first time.
 *
 * options:
 * {
 *   workerGroup:      // workerGroup
 *   workerId:         // workerId
 *   takenUntil:       // Date object (only set if this is a new claim)
 * }
 *
 * returns promise for Task object, or object on the form:
 * {code: 404 || 409, message: "Explanation"}
 */
Task.claimTaskRun = transacting(function(taskId, runId, options, knex) {
  var that = this;
  // First find the run
  var foundRun = knex
                  .select('state', 'workerGroup', 'workerId')
                  .from('runs')
                  .where({
                    taskId:     deslug(taskId),
                    runId:      runId
                  })
                  .forUpdate();
  // When found we claim it, or find an error
  return foundRun.then(function(rows) {
    // Return an error, for the client if the run doesn't exist
    if (rows.length == 0) {
      return {
        code:     404,
        message: "Run and/or task doesn't exist"
      };
    }
    var row = rows[0];
    // If already claimed by this workerId and workerGroup we're done and
    // return task object as promised
    if (row.state === 'running' &&
        row.workerGroup === options.workerGroup &&
        row.workerId    === options.workerId) {
      return that.load(taskId);
    }
    // Claim the run if it's pending
    if (row.state === 'pending') {
      return knex
        ('runs')
        .update({
          state:        'running',
          workerGroup:  options.workerGroup,
          workerId:     options.workerId,
          started:      new Date(),
          takenUntil:   options.takenUntil
        })
        .where({
          taskId:       deslug(taskId),
          runId:        runId,
          state:        'pending',
          started:      null
        })
        .then(function(nb_rows) {
          // If this happens it's fairly safe to assume that the run was claimed
          // by another task while we where waiting, see postgres default
          // isolation level for more details.
          if(nb_rows === 0) {
            return {
              code:     409,
              message:  "Run already claimed"
            };
          }
          return that.load(taskId, knex);
        });
    }
    // Return 409 as the run must have been claimed by another worker
    return {
      code:     409,
      message:  "Run already claimed"
    };
  });
});


/**
 * Reclaim a run and extent the takenUntil property.
 *
 * options:
 * {
 *   workerGroup:      // workerGroup
 *   workerId:         // workerId
 *   takenUntil:       // Date object
 * }
 *
 * returns promise for Task object, or object on the form:
 * {code: 404 || 409, message: "Explanation"}
 */
Task.reclaimTaskRun = transacting(function(taskId, runId, options, knex) {
  var that = this;
  // Try update takenUntil
  var updated = knex
    ('runs')
    .update({
      takenUntil:   options.takenUntil
    })
    .where({
      taskId:       deslug(taskId),
      runId:        runId,
      state:        'running',
      workerGroup:  options.workerGroup,
      workerId:     options.workerId
    });

  // When updated (we check if any rows were updated)
  return updated.then(function(nb_rows) {
    // Explain the error
    if (nb_rows === 0) {
      return knex
        .count('state')
        .from('runs')
        .where({
          taskId:   deslug(taskId),
          runId:    runId
        })
        .then(function(count) {
          if (count == 0) {
            return {
              code:     404,
              message:  "Run and/or task doesn't exist"
            };
          }
          return {
            code:     409,
            message:  "Run not running, or claimed by another worker"
          };
        });
    }
    return that.load(taskId, knex);
  });
});


/** Claim unspecified run for a worker
 *
 * options:
 * {
 *   provisionerId:    // provisionerId
 *   workerType:       // workerType
 *   workerGroup:      // workerGroup
 *   workerId:         // workerId
 *   takenUntil:       // Date object
 * }
 *
 * returns a promise for Task object, or object on the form:
 * {code: 404 || 409 || 204, message: "Explanation"}
 */
Task.claimWork = transacting(function(options, knex) {
  var that = this;
  // Find row to claim
  return knex
    .select('runId', 'tasks.taskId')
    .from('runs')
    .join('tasks', 'runs.taskId', 'tasks.taskId')
    .where({
      'runs.state':           'pending',
      'tasks.provisionerId':  options.provisionerId,
      'tasks.workerType':     options.workerType
    })
    .orderBy('runs.scheduled')
    .limit(1)
    .forUpdate()
    .then(function(rows) {
      // Return 204, if no rows are available
      if (rows.length === 0) {
        return {
          code:     204,
          message:  "No runs pending for given provisionerId and workerType"
        };
      }
      var row = rows[0];
      // Claim the run and be done with it
      return that.claimTaskRun(
        slugid.encode(row.taskId),
        row.runId,
        options,
        knex
      );
    });
});

/** Complete a task
 *
 * options:
 * {
 *   success:  true || false // if run was successful (exited non-zero)
 * }
 *
 * returns promise for Task object, or object on the form:
 * {code: 404 || 409, message: "Explanation"}
 */
Task.completeTask = transacting(function(taskId, runId, options, knex) {
  var that = this;

  // Update row
  var updated = knex
    ('runs')
    .update({
      reasonResolved:   'completed',
      success:          options.success,
      resolved:         new Date(),
      state:            'completed'
    })
    .where({
      taskId:     deslug(taskId),
      runId:      runId,
      state:      'running'
    });

  // Wait to see if we updated anything
  return updated.then(function(nb_rows) {
    if (nb_rows === 0) {
      // Explain the error
      return knex
        .count('state')
        .from('runs')
        .where({
          taskId:   deslug(taskId),
          runId:    runId
        })
        .then(function(count) {
          if (count === 0) {
            // if not in database then it's missing
            return {
              code:     404,
              message:  "Run and/or task doesn't exist"
            };
          }
          // If in database, then we could just be executing an existing
          // completed reporting, let's check that.
          return that.load(taskId, knex).then(function(task) {
            assert(task instanceof that, "task must exist here");
            // Check if it's resolved the way we wanted to resolve it
            if (task.runs[runId].state !== 'completed' ||
                task.runs[runId].success !== options.success) {
              return {
                code:     409,
                message:  "Run not claimed or reported as failed"
              };
            }
            return task;
          });
        });
    }

    // Load modified task object
    return that.load(taskId, knex).then(function(task) {
      assert(task instanceof that, "task must exist here");
      return task;
    });
  });
});

/**
 * Rerun a task, given taskId and a function that will load
 * deleted task status structure from permanent storage, see `Task.serialize`
 * for details on how to serialize to permanent storage.
 *
 * options:
 * {
 *   retries:        // Number of retries to rerun with
 *   fetch:          function() {     // Fetch task status from blob storage
 * }
 *
 * Returns a Task object or an object on the form:
 * {code: 404, message: "explanation"}
 */
Task.rerunTask = transacting(function(taskId, options, knex) {
  var that = this;

  // Load task status structure from database or blob storage if not in database
  var loadedTask = that.load(taskId).then(function(task) {
    if (!task) {
      return fetch().then(function(data) {
        if (!data) {
          return null;
        }
        return that.create(data);
      });
    }
    return task;
  });

  // When loaded, check we actually got a task
  return loadedTask.then(function(task) {
    if (!task) {
      return {
        code:     404,
        message:  "Task not found"
      };
    }

    // Check if the task is resolved
    var isResolved = !task.runs.some(function(run) {
      return run.state === 'pending' || run.state === 'running';
    });

    // If the task isn't resolved, then we're done
    if (!isResolved) {
      return task;
    }

    // Reset retries
    return knex
      ('tasks')
      .update({
        retriesLeft:    options.retries
      })
      .where({
        taskId:         deslug(taskId)
      }).then(function(nb_rows) {
        assert(nb_rows === 1, "We must have one row");
        // Schedule a new run
        // If not then we need to add one pending run
        return knex
                .insert({
                  taskId:         deslug(taskId),
                  runId:          task.runs.length,
                  state:          'pending',
                  reasonCreated:  'rerun',
                  scheduled:      new Date()
                })
                .into('runs')
                .then(function() {
          return that.load(taskId, knex);
        });
      }).then(function(task) {
        assert(task instanceof that, "task should be an instanceof Task");
        return task;
      });
  });
});

/**
 * Find `running` runs with `takenUntil` < now and `retriesLeft` > 0
 * Update the runs to 'failed' with `reasonResolved` as 'claim-expired' and
 * schedule a new pending run
 *
 * Return promise for the list of tasks which just had a run scheduled.
 */
Task.expireClaimsWithRetries = transacting(function(knex) {
  var that = this;
  var now = new Date();

  // Find runs
  var foundRuns = knex
    .select('runs.taskId', 'runs.runId', 'tasks.retriesLeft')
    .forUpdate()
    .from('runs')
    .join('tasks', 'runs.taskId', 'tasks.taskId')
    .where({
      'runs.state':     'running'
    })
    .andWhere('runs.takenUntil', '<', now)
    .andWhere('tasks.retriesLeft', '>', 0)
    .andWhere('tasks.deadline', '>', now);

  // For each run we find
  return foundRuns.then(function(runs) {
    return Promise.all(runs.map(function(run) {
      // Update run to failed
      var updatedRun = knex
        ('runs')
        .update({
          state:            'failed',
          reasonResolved:   'claim-expired',
          success:          false,
          resolved:         now
        })
        .where({
          taskId:           run.taskId,
          runId:            run.runId,
          state:            'running'
        })
        .andWhere('runs.takenUntil', '<', now)
        .then(function(count) {
          // As we selected forUpdate we should always be able to update the
          // run, even with the `where` clause (which why we have it)
          assert(count == 1, "Abort expireClaimsWithRetries run not updated");
        });

      // Update task to have retriesLeft - 1
      var updateTask = knex
        ('tasks')
        .update({
          retriesLeft:    run.retriesLeft - 1,
        })
        .where({
          taskId:         run.taskId,
          retriesLeft:    run.retriesLeft
        })
        .then(function(count) {
          // As we selected forUpdate we should always be able to update the
          // task, even with the `where` clause (which why we have it)
          assert(count == 1, "Abort expireClaimsWithRetries task not updated");
        });

      // Insert new pending run
      var insertRun = knex
        .insert({
          taskId:         run.taskId,
          runId:          run.runId + 1,
          state:          'pending',
          reasonCreated:  'scheduled',
          scheduled:      new Date()
        })
        .into('runs');

      // Wait for operations to finish and load task
      return Promise.all(
        updatedRun,
        updateTask,
        insertRun
      ).then(function() {
        return that.load(slugid.encode(run.taskId), knex);
      }).then(function(task) {
        assert(task instanceof that, "Task must exist!");
        return task;
      });
    }));
  });
});

/**
 * Find runs where the deadline is exceeded and then declare the runs failed.
 *
 * Return a promise for a list of tasks
 */
Task.expireByDeadline = transacting(function(knex) {
  var that = this;
  var now = new Date();

  // Find runs where deadline is exceeded
  var foundRuns = knex
    .select('runs.taskId', 'runs.runId')
    .forUpdate()
    .from('runs')
    .join('tasks', 'runs.taskId', 'tasks.taskId')
    .where(function() {
      this.where({
        'runs.state':     'running'
      })
      .orWhere({
        'runs.state':     'pending'
      });
    })
    .andWhere('tasks.deadline', '<', now);

  // Update runs
  return foundRuns.then(function(runs) {
    return Promise.all(runs.map(function(run) {
      return knex
        ('runs')
        .update({
          state:            'failed',
          reasonResolved:   'deadline-exceeded',
          success:          false,
          resolved:         now
        })
        .where(function() {
          this.where({
            'runs.state':     'running'
          })
          .orWhere({
            'runs.state':     'pending'
          });
        })
        .andWhere({
          taskId:           run.taskId,
          runId:            run.runId,
        })
        .then(function(count) {
          // This shouldn't happen was we select for update
          assert(count == 1, "Abort expireByDeadline, run not updated");
          return that.load(slugid.encode(run.taskId), knex);
        }).then(function(task) {
          assert(task instanceof that, "Task must exist!");
          return task;
        });
    }));
  });
});

/**
 * Find runs where takenUntil < now and retriesLeft is 0 and declare the
 * runs failed.
 *
 * Return a promise for a list of tasks
 */
Task.expireClaimsWithoutRetries = transacting(function(knex) {
  var that = this;
  var now = new Date();

  // Find runs
  var foundRuns = knex
    .select('runs.taskId', 'runs.runId')
    .forUpdate()
    .from('runs')
    .join('tasks', 'runs.taskId', 'tasks.taskId')
    .where({
      'runs.state':         'running',
      'tasks.retriesLeft':  0
    })
    .andWhere('runs.takenUntil', '<', now)
    .andWhere('tasks.deadline', '>', now);

  // Update runs
  return foundRuns.then(function(runs) {
    return Promise.all(runs.map(function(run) {
      return knex
        ('runs')
        .update({
          state:            'failed',
          reasonResolved:   'claim-expired',
          success:          false,
          resolved:         now
        })
        .where({
          taskId:           run.taskId,
          runId:            run.runId,
          state:            'running'
        })
        .then(function(count) {
          // This shouldn't happen was we select for update
          assert(count == 1, "Abort expireByDeadline, run not updated");
          return that.load(slugid.encode(run.taskId), knex);
        }).then(function(task) {
          assert(task instanceof that, "Task must exist!");
          return task;
        });
    }));
  });
});

/**
 * Move tasks 24 hours past their deadline to permanent storage.
 *
 * options:
 * {
 *   store: function(task) { // store task where it can be fetched later
 * }
 *
 * Note, it's strongly recommended to use `Task.serialize` for serializing task
 * status structure for storage.
 */
Task.moveTaskFromDatabase = transacting(function(options, knex) {
  var that = this;

  // Find yesterday
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  var count = 0;
  // Find tasks to move (and select them for update)
  return knex
    .select('taskId')
    .forUpdate()
    .from('tasks')
    .where('deadline', '<', yesterday)
    .then(function(tasks) {
      return Promise.all(tasks.map(function(task) {
        // Load each task
        return that.load(slugid.encode(task.taskId), knex).then(function(task) {
          assert(task instanceof that, "Task must exist");
          task.runs.forEach(function(run) {
            assert(run.state == 'failed' || run.state == 'completed',
                   "Expected task to be resolved past its deadline");
          });
          // Store the task in permanent storage
          count += 1;
          return options.store(task);
        }).then(function() {
          // Delete from database
          return knex
            .del()
            .from('tasks')
            .where({
              taskId:       task.taskId
            })
            .andWhere('deadline', '<', yesterday)
            .then(function(count) {
              if (count === 0) {
                debug("Failed to delete task %s in moveTaskFromDatabase",
                      slugid.encode(task.taskId));
              }
            });
        });
      })).then(function() {
        return count;
      });
    });
});

/** Return task status structure */
Task.prototype.status = function() {
  // Return task status structure in compliance with JSON format
  var lastRun = _.last(this.runs) || {};
  var state = lastRun.state || 'unscheduled';
  return {
    taskId:         this.taskId,
    provisionerId:  this.provisionerId,
    workerType:     this.workerType,
    schedulerId:    this.schedulerId,
    taskGroupId:    this.taskGroupId,
    deadline:       this.deadline.toJSON(),
    retriesLeft:    this.retriesLeft,
    state:          state,
    runs: _.sortBy(this.runs.map(function(run) {
      var r = {
        runId:          run.runId,
        state:          run.state,
        reasonCreated:  run.reasonCreated,
        scheduled:      run.scheduled.toJSON(),
      };
      // Add optional properties
      if (run.reasonResolved != null) {
        r.reasonResolved = run.reasonResolved;
      }
      if (run.success != null) {
        r.success = run.success;
      }
      if (run.workerGroup != null) {
        r.workerGroup = run.workerGroup;
      }
      if (run.workerId != null) {
        r.workerId = run.workerId;
      }
      if (run.takenUntil != null) {
        r.takenUntil = run.takenUntil.toJSON();
      }
      if (run.started != null) {
        r.started = run.started.toJSON();
      }
      if (run.resolved != null) {
        r.resolved = run.resolved.toJSON();
      }
      return r;
    }), 'runId')
  };
};

/**
 * Render to JSON taskInfo object that can be used by `Task.deserialize`,
 * `Task.create` and the fetch callback in `Task.rerun`.
 */
Task.prototype.serialize = function() {
  return {
    version:        1,
    taskId:         this.taskId,
    provisionerId:  this.provisionerId,
    workerType:     this.workerType,
    schedulerId:    this.schedulerId,
    taskGroupId:    this.taskGroupId,
    created:        this.created.toJSON(),
    deadline:       this.deadline.toJSON(),
    retriesLeft:    this.retriesLeft,
    routes:         this.routes,
    owner:          this.owner,
    runs: _.sortBy(this.runs.map(function(run) {
      return {
        runId:          run.runId,
        state:          run.state,
        reasonCreated:  run.reasonCreated,
        reasonResolved: run.reasonResolved,
        success:        run.success,
        workerGroup:    run.workerGroup,
        workerId:       run.workerId,
        takenUntil:     run.takenUntil  ? run.takenUntil.toJSON() : null,
        scheduled:      run.scheduled.toJSON(),
        started:        run.started     ? run.started.toJSON()    : null,
        resolved:       run.resolved    ? run.resolved.toJSON()   : null
      };
    }), 'runId')
  };
};


/**
 * Create task object from JSON taskInfo object from `Task.serialize`
 *
 * This will not create the task object in the database, but just restore it
 * from serialized format.
 */
Task.deserialize = function(taskInfo) {
  var rowInfo = loadTaskInfo(taskInfo);
  return new this(rowInfo);
};
