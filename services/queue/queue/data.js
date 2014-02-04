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