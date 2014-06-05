suite('queue/tasks_store', function() {
  var Promise   = require('promise');
  var slugid    = require('slugid');
  var assert    = require('assert');
  var TaskStore = require('../../queue/taskstore');
  var Knex      = require('knex');
  var schema    = require('../../queue/schema');
  var base      = require('taskcluster-base');

  // Load configuration
  var cfg = base.config({
    defaults:     require('../../config/defaults'),
    profile:      require('../../config/' + 'test'),
    filename:     'taskcluster-queue'
  });

  var connect = function() {
    var db = Knex({
      client:     'postgres',
      connection: cfg.get('database:connectionString')
    });

    // ensure we have a clean working state in the database.
    var create = schema.create.bind(schema, db);
    return schema.destroy(db).then(create).then(function() {
      return db;
    });
  };

  var Tasks;
  var knex;

  function mapByTaskId(list) {
    return list.reduce(function(result, row) {
      result[row.taskId] = row;
      return result;
    }, {});
  }

  function taskFactory(overrides) {
    return {
      "taskId":             slugid.v4(),
      "provisionerId":      "jonasfj-test-provid",
      "workerType":         "jonasfj-test-worker",
      "state":              "pending",
      "reason":             "none",
      "runs":               [],
      "routing":            "jonasfjs-precious-tasks.stupid-test.aws",
      "retries":            0,
      "timeout":            60,
      "priority":           2.6,
      "created":            "2014-02-01T03:22:36.356Z",
      "deadline":           "2034-03-01T03:22:36.356Z",
      "takenUntil":         "1970-01-01T00:00:00.000Z"
    };
  }

  function runFactory() {
    return { workerId: 1, workerGroup: 'group' };
  }

  setup(function() {
    return connect().then(function(_knex) {
      knex = _knex;
      Tasks = new TaskStore(knex);
    });
  });

  test('task storage', function() {
    var task = taskFactory();
    return Tasks.create(task).then(function() {
      return Tasks.findBySlug(task.taskId);
    }).then(function(record) {
      assert.deepEqual(task, record);
      return Tasks.delete(task.taskId);
    }).then(function() {
      return Tasks.findBySlug(task.taskId);
    }).then(function(record) {
      assert.equal(record, null);
    });
  });

  suite('#claim', function() {
    var task;
    setup(function() {
      task = taskFactory();
      return Tasks.create(task);
    });

    test('attempt to claim and fail', function() {
      task.state = 'running';
      return knex('tasks').
        update({ state: 'running' }).
        where('taskId', slugid.decode(task.taskId)).
        then(function() {
          return Tasks.claim(task.taskId, new Date().toJSON(), {});
        }).then(function(taskId) {
          assert.equal(taskId, null);
        });
    });

    test('reclaim', function() {
      var run = runFactory();
      var reclaimDate = new Date(2020, 1);
      return Tasks.claim(task.taskId, new Date(), run).then(function() {
        return Tasks.findBySlug(task.taskId);
      }).then(function(task) {
        var createdRun = task.runs[0];
        return Tasks.claim(task.taskId, reclaimDate, createdRun);
      }).then(function(result) {
        return Tasks.findBySlug(task.taskId);
      }).then(function(updatedTask) {
        assert.deepEqual(updatedTask.takenUntil, reclaimDate.toJSON());
      });
    });

    test('create first run and claim', function() {
      var takenUntil = new Date(2020, 1);
      var run = runFactory();
      return Tasks.claim(task.taskId, takenUntil, run).
        then(function(runId) {
          assert.equal(runId, 1);
          return Tasks.findBySlug(task.taskId);
        }).
        then(function(taskWithRuns) {
          task.runs = [
            {
              runId: 1,
              workerId: run.workerId,
              workerGroup: run.workerGroup
            }
          ];

          task.retries--;
          task.state = 'running';
          task.takenUntil = takenUntil.toJSON();

          assert.deepEqual(task, taskWithRuns);
        });
    });
  });

  suite('#completeTask', function() {
    var task;

    test('does not mark pending task', function() {
      var task = taskFactory();
      return Tasks.create(task).
        then(function() {
          return Tasks.completeTask(task.taskId);
        }).
        then(function(completed) {
          assert.ok(!completed);
          return Tasks.findBySlug(task.taskId);
        }).
        then(function(record) {
          assert.equal(record.state, task.state);
        });
    });

    test('marks running task complete', function() {
      var task = taskFactory();
      task.state = 'running';
      return Tasks.create(task).
        then(function() {
          return Tasks.completeTask(task.taskId);
        }).
        then(function(completed) {
          assert.ok(completed);
          return Tasks.findBySlug(task.taskId);
        }).
        then(function(record) {
          assert.equal(record.state, 'completed');
        });
    });
  });

  suite('#findOne', function() {
    var task;
    setup(function() {
      task = taskFactory();
      task.provisionerId = 'foo';
      task.workerType = 'type';
      return Tasks.create(task).then(function() {
        return Tasks.claim(task.taskId, new Date(), runFactory());
      });
    });

    test('finding first task and its runs', function() {
      var expected;

      return Tasks.findBySlug(task.taskId).
        then(function(_expected) {
          expected = _expected;
        }).
        then(function() {
          return Tasks.findOne({ provisionerId: task.provisionerId });
        }).
        then(function(record) {
          assert.deepEqual(expected, record);
        });
    });
  });

  suite('#findAll', function() {
    var taskFoo;
    setup(function() {
      taskFoo = taskFactory();
      taskFoo.provisionerId = 'foo';
      taskFoo.workerType = 'type';
      return Tasks.create(taskFoo).then(function() {
        return Tasks.claim(taskFoo.taskId, new Date(), runFactory());
      });
    });

    var taskBar;
    setup(function() {
      taskBar = taskFactory();
      taskBar.provisionerId = 'bar';
      taskBar.workerType = 'type';
      return Tasks.create(taskBar);
    });

    test('single result', function() {
      return Tasks.findAll({
        provisionerId: 'bar'
      }).then(function(records) {
        assert.deepEqual(records[0], taskBar);
      });
    });

    test('find multiple', function() {
      return Tasks.findAll({
        workerType: 'type'
      }).then(function(records) {
        var byId = mapByTaskId(records);

        return Promise.all([
          Tasks.findBySlug(taskFoo.taskId),
          Tasks.findBySlug(taskBar.taskId)
        ]).then(function(list) {
          assert.deepEqual(
            byId,
            mapByTaskId(list)
          );
        });
      });
    });
  });

  suite('#rerunTask', function() {
    var task;
    setup(function() {
      task = taskFactory();
      task.state = 'running';
      return Tasks.create(task);
    });

    test('without a completed task', function() {
      return Tasks.rerunTask(task.taskId, 22).then(function(record) {
        assert.ok(!record, 'no task was updated for rerun');
      });
    });

    test('with a completed task', function() {
      var rerunTask;

      return Tasks.completeTask(task.taskId).then(function() {
        return Tasks.rerunTask(task.taskId, 22);
      }).then(function(value) {
        rerunTask = value;
        return Tasks.findBySlug(task.taskId);
      }).then(function(record) {
        // returns the rerun task
        assert.deepEqual(rerunTask, record);

        assert.deepEqual(record.takenUntil, new Date(0).toJSON());
        assert.equal(record.retries, 22);
      });
    });
  });

  suite('#findAndUpdateFailed', function() {
    var deadlineTask;
    var retriesTask;

    setup(function() {
      deadlineTask = taskFactory();
      deadlineTask.state = 'running';
      deadlineTask.deadline = new Date(0).toJSON();
      deadlineTask.takenUntil = new Date(2030, 1).toJSON();

      return Tasks.create(deadlineTask);
    });

    setup(function() {
      retriesTask = taskFactory();
      retriesTask.state = 'running';
      retriesTask.retries = 0;
      retriesTask.takenUntil = new Date(0);

      return Tasks.create(retriesTask);
    });

    test('expire exhausted retries and deadline expiries', function() {
      function taskIdsOnly(list) {
        return list.
          map(function(row) {
            return row.taskId;
          }).
          sort();
      }

      return Tasks.findAndUpdateFailed().
        then(function(tasks) {
          assert.deepEqual(
            taskIdsOnly(tasks),
            taskIdsOnly([retriesTask, deadlineTask])
          );

          return Tasks.findAll({ state: 'failed' });
        }).
        then(function(tasks) {
          var tasksById = mapByTaskId(tasks);
          var deadlinedRecord = tasksById[deadlineTask.taskId];
          var retriesRecord = tasksById[retriesTask.taskId];

          assert.equal(deadlinedRecord.state, 'failed');
          assert.equal(retriesRecord.state, 'failed');
          assert.equal(deadlinedRecord.reason, 'deadline-exceeded');
          assert.equal(retriesRecord.reason, 'retries-exhausted');
        });
    });
  });

  suite('#findAndUpdatePending', function() {
    test('with expired', function() {
      var task = taskFactory();
      task.retries = 10;
      return Tasks.create(task).
        then(function() {
          return Tasks.claim(task.taskId, new Date(0), runFactory());
        }).
        then(function() {
          return Tasks.findAndUpdatePending();
        }).
        then(function(rows) {
          assert.equal(rows[0].taskId, task.taskId);
        });
    });
  });
});
