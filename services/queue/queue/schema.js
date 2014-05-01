var Promise = require('promise');

/**
Create the schema for our database
*/
exports.create = function(knex) {
  return knex.transaction(function(t) {
    var Tasks = knex.schema.hasTable('tasks').
      then(function(exists) {
        if (exists) return;
        return knex.schema.createTable('tasks', function(t) {
          t.uuid('taskId').primary();
          t.string('provisionerId', 22).notNullable();
          t.string('workerType', 22).notNullable();
          t.string('state').notNullable();
          t.string('reason').notNullable();
          t.string('routing', 128).notNullable();
          t.integer('retries').notNullable();
          t.integer('timeout').notNullable();
          t.specificType('priority', 'double precision').notNullable();
          t.timestamp('created').notNullable();
          t.timestamp('deadline').notNullable();
          t.timestamp('takenUntil').notNullable();
        }).transacting(t);
      });

    var Runs = knex.schema.hasTable('runs').
      then(function(exists) {
        if (exists) return;
        return knex.schema.createTable('runs', function(t) {
          t.uuid('taskId').references('taskId').inTable('tasks').onDelete('cascade');
          t.integer('runId').notNullable();
          t.string('workerGroup', 22).notNullable();
          t.string('workerId', 22).notNullable();
          t.primary(['runId', 'taskId']);
        }).transacting(t);
      });

    return Promise.all([Tasks, Runs]).then(t.commit, t.rollback);
  });
};

/**
Destroy all traces of the schema and all associated data.
*/
exports.destroy = function(knex) {
  // runs must be dropped first... if we used postgres schemas this would be
  // easier but remove the benefits of using knex.
  return knex.schema.dropTableIfExists('runs').then(function() {
    return knex.schema.dropTableIfExists('tasks');
  });
};
