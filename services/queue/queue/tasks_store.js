var mem = require('memoizee');
var slugid = require('slugid');
var Promise = require('promise');
var debug = require('debug')('queue:tasksStore');

var TASK_FIELDS = [
  'taskId',
  'provisionerId',
  'workerType',
  'state',
  'reason',
  'routing',
  'retries',
  'timeout',
  'priority',
  'created',
  'deadline',
  'takenUntil'
];

var JSONIFY_PROPS = [
  'created',
  'deadline',
  'takenUntil'
];

var RUN_FIELDS = [
  'runId',
  'workerGroup',
  'workerId'
];

/**
Build a record suitable for storage in the database from an external object.

XXX: Ideally this would be done by a "model" rather then the store in DM pattern.

@return {Object}
*/
function incomingTask(input) {
  var record = TASK_FIELDS.reduce(function(record, key) {
    record[key] = input[key];
    return record;
  }, {});

  record.taskId = slugid.decode(record.taskId);
  return record;
}

function mapTask(taskId, row) {
  var record = TASK_FIELDS.reduce(function(model, key) {
    model[key] = row[key];
    return model;
  }, {});

  JSONIFY_PROPS.forEach(function(key) {
    record[key] = record[key].toJSON();
  });

  record.taskId = taskId;
  record.runs = [];
  return record;
}

function mapRun(row) {
  return RUN_FIELDS.reduce(function(model, key) {
    model[key] = row[key];
    return model;
  }, {});
}

/**
Build a record suitable for returning from the store.
*/
function outgoingTasks(rows) {
  var byTaskId = {};

  return rows.reduce(function(tasks, row) {
    // extract the task by task id (only create one)
    var taskId = slugid.encode(row.taskId);

    var task = byTaskId[taskId];
    if (!task) {
      task = byTaskId[taskId] = mapTask(taskId, row);
      tasks.push(task);
    }

    if (row.runId) {
      task.runs.push(mapRun(row));
    }

    return tasks;
  }, []);
}

function decorateDecodeSlug(method) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    args[0] = slugid.decode(args[0]);
    return method.apply(this, args);
  };
}

function first(rows) {
  return rows[0];
}


module.exports = mem(function(knex) {
  function taskJoinQuery() {
    return knex('tasks').
      select('*', 'tasks.taskId as taskId').
      join('runs', 'tasks.taskId', '=', 'runs.taskId', 'left outer').
      // correctly order runs so the array comes out in the correct order.
      orderBy('runs.runId');
  }

  function findAllByTaskId(taskIds) {
    if (!taskIds.length) {
      return [];
    }

    return taskJoinQuery().
      whereIn('tasks.taskId', taskIds).
      then(outgoingTasks);
  }

  return {
    create: function(task) {
      return knex('tasks').insert(incomingTask(task));
    },

    delete: decorateDecodeSlug(function(taskId) {
      return knex('tasks').where('taskId', taskId).del();
    }),

    findBySlug: decorateDecodeSlug(function(taskId) {
      return taskJoinQuery().
        where('tasks.taskId', taskId).
        then(outgoingTasks).
        then(first);
    }),

    claim: function(slug, takenUntil, run) {
      debug('claim', slug, 'until', takenUntil);
      if (run.runId) {
        return this.refreshClaim(slug, takenUntil, run);
      }
      return this.createClaim(slug, takenUntil, run);
    },

    refreshClaim: decorateDecodeSlug(function(taskId, takenUntil, run) {
      debug('refresh claim', taskId, takenUntil);
      return knex('tasks').
        update({
          takenUntil: takenUntil,
        }).
        where('taskId', taskId).
        andWhere('state', 'running');
    }),

    createClaim: decorateDecodeSlug(function(taskId, takenUntil, run) {
      debug('create claim', taskId, takenUntil);
      return knex.transaction(function(t) {
        // attempt to acquire the task
        var markRunning = knex('tasks').
          transacting(t).
          update({
            takenUntil: takenUntil,
            retries: knex.raw('"retries" - 1'),
            state: 'running'
          }).
          where('taskId', taskId).
          andWhere('state', 'pending');

        return markRunning.then(function(count) {
          if (!count) {
            return t.commit([]);
          }

          var runIdCount = knex('runs').
            select(knex.raw('COUNT("runId") + 1')).
            where('taskId', taskId).
            toString();

          return knex('runs').
            transacting(t).
            insert({
              taskId: taskId,
              workerGroup: run.workerGroup,
              workerId: run.workerId,
              runId: knex.raw('(' + runIdCount + ')')
            }).
            returning('runId').
            then(t.commit).
            catch(t.rollback);
        });
      }).
      then(first);
    }),

    completeTask: decorateDecodeSlug(function(taskId) {
      return knex('tasks').
        update({ state: 'completed' }).
        where('taskId', taskId).
        andWhere('state', 'running').
        then(function(count) {
          return count !== 0;
        });
    }),

    findAll: function(query) {
      return taskJoinQuery().
        where(query).
        then(outgoingTasks);
    },

    /**
    Find a single task matching the query (inclusive of runs).
    */
    findOne: function(query) {
      // when we need to limit the number of results we need to do a nested
      // query to first find all the taskIds that match the query then do a join
      // to find all those rows with their tasks included.
      return taskJoinQuery().
        whereIn('tasks.taskId', function() {
          this.select('taskId').from('tasks').where(query).limit(1);
        }).
        then(outgoingTasks).
        then(first);
    },

    rerunTask: decorateDecodeSlug(function(taskId, retries) {
      return knex('tasks').
        update({
          state: 'pending',
          reason: 'rerun-requested',
          retries: retries,
          takenUntil: new Date(0), // reset taken until
        }).
        where('taskId', taskId).
        andWhere(function() {
          this.
            where('state', 'completed').
            orWhere('state', 'failed');
        }).
        then(function(count) {
          if (!count) return null;
          // yuck!
          return this.findBySlug(slugid.encode(taskId));
        }.bind(this));
    }),

    findAndUpdateFailed: function() {
      var deadlineExpire = knex('tasks').
        update({
          state: 'failed',
          reason: 'deadline-exceeded'
        }).
        where('deadline', '<', new Date()).
        andWhere(function() {
          this.
            where('state', 'pending').
            orWhere('state', 'running');
        }).
        returning('taskId');

      var retiresExhausted = knex('tasks').
        update({
          state: 'failed',
          reason: 'retries-exhausted'
        }).
        where({
          state: 'running',
          retries: 0
        }).
        andWhere(
          'takenUntil',
          '<',
          new Date()
        ).
        returning('taskId');

      return Promise.all([deadlineExpire, retiresExhausted]).
        then(function(records) {
          return records.reduce(function(list, taskIds) {
            return list.concat(taskIds);
          }, []);
        }).
        then(findAllByTaskId);
    },

    findAndUpdatePending: function() {
      return knex('tasks').
        update({
          state: 'pending'
        }).
        where('takenUntil', '<', new Date()).
        andWhere('state', 'running').
        andWhere('retries', '>', 0).
        returning('taskId').
        then(findAllByTaskId);
    }
  };
});
