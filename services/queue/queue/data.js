var pg      = require('pg.js');
var nconf   = require('nconf');
var Promise = require('promise');
var debug   = require('debug')('queue:data');

var _connString = null;


/**
 * Promised wrapper around Client.query, takes the same arguments except for the
 * `callback` argument which is provided by this function.
 */
pg.Client.prototype.promise = function() {
  var params = Array.prototype.slice.call(arguments);
  var that   = this;
  return new Promise(function(accept, reject) {
    params.push(function(err, result) {
      if (err) {
        reject(err);
      } else {
        accept(result);
      }
    });
    pg.Client.prototype.query.apply(that, params);
  });
};


/**
 * Returns a promise for a postgres client with method called release used to
 * return client to the client pool.
 */
var connect = function() {
  return new Promise(function(accept, reject) {
    pg.connect(_connString, function(err, client, done) {
      if (err) {
        debug("Failed to connect to database, error: %j", err);
        reject(err);
      } else {
        // Attach the `done` function to the client as the `release` method
        client.release = done;
        accept(client);
      }
    });
  });
};


/** Tasks table definition */
var tasks_table_definition = [
  //Name:                Datatype:                 Constraint:
  ['task_id',           'uuid',                   'PRIMARY KEY'   ],
  ['provisioner_id',    'varchar(36)',            'NOT NULL'      ],
  ['worker_type',       'varchar(36)',            'NOT NULL'      ],
  ['state',             'varchar(255)',           'NOT NULL'      ],
  ['reason',            'varchar(255)',           'NOT NULL'      ],
  ['routing',           'varchar(64)',            'NOT NULL'      ],
  ['retries',           'integer',                'NOT NULL'      ],
  ['priority',          'double precision',       'NOT NULL'      ],
  ['created',           'timestamp',              'NOT NULL'      ],
  ['deadline',          'timestamp',              'NOT NULL'      ],
  ['taken_until',       'timestamp',              'NOT NULL'      ]
];


/** Runs table definition */
var runs_table_definition = [
  //Name:                Datatype:                 Constraint:
  ['task_id',           'uuid',                   'REFERENCES tasks ON DELETE CASCADE'],
  ['run_id',            'integer',                'NOT NULL'      ],
  ['worker_group',      'varchar(36)',            'NOT NULL'      ],
  ['worker_id',         'varchar(36)',            'NOT NULL'      ],
  ['PRIMARY KEY (task_id, run_id)'                                ]
];


/** Ensure database tables exists and connection string is setup */
var setupDatabase = function() {
  debug("Setup the database table and connection string");

  // Construct database connection string
  _connString = [
    'pg://',
    nconf.get('database:user'),
    ':',
    nconf.get('database:password'),
    '@',
    nconf.get('database:host'),
    ':',
    nconf.get('database:port'),
    '/',
    nconf.get('database:name')
  ].join('');

  // Connect to database
  var get_client = connect();

  // Get client and begin a transaction
  var client = null;
  var got_client = get_client.then(function(c) {
    debug("Got postgres client and starting transaction");
    client = c;
    return client.promise('BEGIN');
  });

  // Create the tasks table
  var created_tasks_table = got_client.then(function() {
    // Create columns from definition
    var cols = tasks_table_definition.map(function(col) {
      return col.join(' ');
    }).join(', \n\t');

    // Create tasks table
    var sql = 'CREATE TABLE IF NOT EXISTS tasks (\n\t' + cols + '\n)';
    debug("Creating tasks table with:\n%s", sql);
    return client.promise(sql);
  });

  // Create the runs table after tasks have been created
  var created_runs_table = created_tasks_table.then(function() {
    // Create columns from definition
    var cols = runs_table_definition.map(function(col) {
      return col.join(' ');
    }).join(',\n\t');

    // Create runs table
    var sql = 'CREATE TABLE IF NOT EXISTS runs (\n\t' + cols + '\n)';
    debug("Creating runs table with:\n%s", sql);
    return client.promise(sql);
  });

  // Commit transaction
  created_runs_table.then(function() {
    debug("Committing transaction");
    return client.promise('COMMIT');
  });

  // Free the client at the end of all this
  return created_runs_table.then(function() {
    client.release();
  }, function(err) {
    client.release();
    debug("Failed to setup database tables: %s or as JSON %j", err, err);
    throw new Error("Failed to setup database");
  });
};
exports.setupDatabase = setupDatabase;


/** Disconnect from the database */
var disconnect = function() {
  pg.end();
}
exports.disconnect = disconnect;


/**
 * Create new entry in tasks table from task status object
 * This will not create any runs entries...
 *
 * Returns a promise of correct insertion
 */
exports.createTask = function(task) {
  return connect().then(function(client) {
    var properties = [
      'task_id', 'provisioner_id', 'worker_type', 'state', 'reason', 'routing',
      'retries', 'priority', 'created', 'deadline', 'taken_until'
    ];

    // Construct string of columns
    var cols = properties.join(', ');

    // Construct string of place_holders for values
    var place_folders = properties.map(function(prop, index) {
      return "$" + (index + 1);
    }).join(', ');

    // Construct list of values
    var values = properties.map(function(prop) {
      return task[prop];
    });

    // Construct SQL statement
    var sql = 'INSERT INTO tasks (' + cols + ') VALUES (' + place_folders + ')';

    debug('SQL statement for inserting new task: %s', sql);

    // Insert into the database
    return client.promise(sql, values).then(function() {
      client.release();
      return;
    }, function(err) {
      client.release();
      debug("Failed to create task, error: %s as JSON %j", err, err);
      throw new Error("Task could be accepted in database");
    });
  });
};

/** Delete task by with given task identifier, returns a promise of success */
exports.deleteTask = function(task_id) {
  return connect().then(function(client) {
    var sql = 'DELETE FROM tasks WHERE task_id = $1';
    return client.promise(sql, [task_id]).then(function() {
      client.release();
      return;
    }, function(err) {
      client.release();
      debug("Failed to delete task, error: %s as JSON %j", err, err);
      throw new Error("Task could be deleted from database");
    });
  });
};

/**
 * Load task status structure by task_id, includes all runs.
 *
 * Returns a promise for the task status structure, or null if task_id isn't
 * found in the database.
 */
exports.loadTask = function(task_id) {
  return connect().then(function(client) {
    // Columns we want from tasks
    var task_cols = [
      'provisioner_id', 'worker_type', 'state', 'reason', 'routing', 'retries',
      'priority', 'created', 'deadline', 'taken_until',
    ];

    // Dates, which will be returned as javascript data objects, they should
    var dates = ['created', 'deadline', 'taken_until'];

    // Columns we want from runs
    var run_cols = [
      'run_id', 'worker_group', 'worker_id'
    ];

    // Columns we want... as comma separated list
    cols = task_cols.join(', ') + ', ' + run_cols.join(', ');

    // SQL statement for selecting tasks and all runs if any..
    var sql = 'SELECT ' + cols + ' FROM tasks LEFT OUTER JOIN runs ' +
              'ON (tasks.task_id = runs.task_id) WHERE ' +
              'tasks.task_id = $1 ORDER BY run_id';

    return client.promise(sql, [task_id]).then(function(result) {
      // Free the client so others can use it
      client.release();

      // Return null if there is no rows
      if (result.rows.length == 0) {
        debug('Failed to fetch task with task_id: %s', task_id);
        return null;
      }

      // Task status
      var task_status = {
        task_id:            task_id,
        runs:               []
      };

      // Set attributes from tasks table
      task_cols.forEach(function(col) {
        task_status[col] = result.rows[0][col];
      });

      // For each row make a run and add it to the runs list
      result.rows.forEach(function(row) {
        // Skip null rows
        if (row.run_id == null) {
          return;
        }

        // Create a run to add
        var run = {};
        // Set attributes from runs table
        run_cols.forEach(function(col) {
          run[col] = row[col];
        });
        task_status.runs.push(run);
      });

      // Convert data object to JSON format
      dates.forEach(function(property) {
        task_status[property] = task_status[property].toJSON();
      });

      // Return task status structure
      return task_status;
    }, function(err) {
      client.release();
      debug("Failed to load task, error: %s as JSON %j", err, err);
      throw new Error("Task could be loaded from database");
    });
  });
};

/**
 * Claim a task given by `task_id` until `taken_until`, where `run` is an object
 * with keys `worker_group`, `worker_id` and optionally `run_id`.
 *
 * Return a promise of run_id if successful, or null if task not found or taken
 * by somebody else...
 */
exports.claimTask = function(task_id, taken_until, run) {
  return connect().then(function(client) {
    if (run.run_id !== undefined) {
      // Update taken_until for an existing run...
      // TODO: Check that the run also exists
      var sql = 'UPDATE tasks SET taken_until = $2 WHERE task_id = $1 AND ' +
                'state = \'running\'';
      return client.promise(sql, [task_id, taken_until]).then(function(result) {
        client.release();
        if(result.rowCount == 0) {
          // We didn't update any task, so this failed
          return null;
        } else {
          return run.run_id;
        }
      });
    } else {
      return client.promise('BEGIN').then(function() {
        // Claim task
        return client.promise(
          'UPDATE tasks SET taken_until = $2, retries = retries - 1, ' +
          'state = \'running\' ' +
          'WHERE task_id = $1 AND state = \'pending\'',
          [task_id, taken_until]
        ).then(function(result) {
          // We didn't take the task return null
          if(result.rowCount == 0) {
            return null;
          }
          // Add new run
          return client.promise(
            'INSERT INTO runs (task_id, run_id, worker_group, worker_id) ' +
            'SELECT $1, COUNT(rs.run_id) + 1, $2, $3 FROM runs AS rs WHERE ' +
            'rs.task_id = $1 RETURNING run_id',
            [task_id, run.worker_group, run.worker_id]
          ).then(function(result) {
            return result.rows[0].run_id;
          });
        });
      }).then(function(retval) {
        return client.promise('COMMIT').then(function() {
          client.release();
          return retval;
        });
      });
    }
  });
};


/** Create new task status structure from json object */
/*  // Let's implement this in the future, but not right now... Just need
    // something that works reasonably well...
exports.Task = function(status) {
  // Clone status arguments
  this.status = _.cloneDeep(status);

  // Parse datetime strings to Date objects
  var dates = ['created', 'deadline', 'taken_until'];
};

exports.Task.prototype.persist = function() {};
exports.Task.prototype.completed = function() {};
exports.Task.prototype.claimUntil = function(datetime, run) {};
exports.Task.prototype.toJSON = function() {};

exports.Task.query = function() {};
exports.Task.load = function() {};
*/


