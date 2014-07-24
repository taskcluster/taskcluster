suite('queue/task', function() {
  var Promise     = require('promise');
  var slugid      = require('slugid');
  var assert      = require('assert');
  var TaskModule  = require('../../queue/task');
  var base        = require('taskcluster-base');
  var _           = require('lodash');

  // Load configuration
  var cfg = base.config({
    defaults:     require('../../config/defaults'),
    profile:      require('../../config/' + 'test'),
    filename:     'taskcluster-queue'
  });

  // Check that we have an account
  if (!cfg.get('database:connectionString')) {
    console.log("\nWARNING:");
    console.log("Skipping 'task' tests, missing config file: " +
                "taskcluster-queue.conf.json");
    return;
  }

  // Configure database connection
  var Task = null;
  setup(function() {
    Task = TaskModule.configure({
      connectionString:       cfg.get('database:connectionString')
    });
  });

  // Close database connection
  teardown(function() {
    return Task.close();
  });

  test("ensureTables", function() {
    return Task.ensureTables();
  });

  test("ensureTables2", function() {
    return Task.ensureTables();
  });

  test("dropTables", function() {
    return Task.dropTables().then(function() {
      // table will be needed by the rest of tests
      return Task.ensureTables();
    });
  });

  test("create", function() {
    return Task.create({
      version:        1,
      taskId:         slugid.v4(),
      provisionerId:  'provisioner-id',
      workerType:     'worker-type',
      priority:       5.4,
      created:        new Date().toJSON(),
      deadline:       new Date().toJSON(),
      retriesLeft:    4,
      routing:        "my.routing.key",
      owner:          "jonasfj@mozilla.com",
      runs:           [{
        runId:          0,
        state:          'pending',
        reasonCreated:  'new-task',
        scheduled:      new Date().toJSON()
      }]
    }).then(function(result) {
      assert(result.taskId, "Missing taskId");
    });
  });

  test("create (exists)", function() {
    var taskId = slugid.v4();
    return Task.create({
      version:        1,
      taskId:         taskId,
      provisionerId:  'provisioner-id',
      workerType:     'worker-type',
      priority:       5.4,
      created:        new Date().toJSON(),
      deadline:       new Date().toJSON(),
      retriesLeft:    4,
      routing:        "my.routing.key",
      owner:          "jonasfj@mozilla.com",
      runs:           [{
        runId:          0,
        state:          'pending',
        reasonCreated:  'new-task',
        scheduled:      new Date().toJSON()
      }]
    }).then(function(result) {
      assert(result.taskId == taskId, "Expected taskId");
      return Task.create({
        version:        1,
        taskId:         taskId,
        provisionerId:  'provisioner-id',
        workerType:     'worker-type',
        priority:       5.4,
        created:        new Date().toJSON(),
        deadline:       new Date().toJSON(),
        retriesLeft:    4,
        routing:        "my.routing.key",
        owner:          "jonasfj@mozilla.com",
        runs:           [{
          runId:          0,
          state:          'pending',
          reasonCreated:  'new-task',
          scheduled:      new Date().toJSON()
        }]
      }, true);
    });
  });

  test("serialize/deserialize (version 1)", function() {
    // WARNING: Modifying this test may break compatibility with task status
    // structures stored in blob storage. Please make a new version number
    // instead.
    var taskId = slugid.v4();
    var task = Task.deserialize({
      version:        1,
      taskId:         taskId,
      provisionerId:  'provisioner-id',
      workerType:     'worker-type',
      priority:       5.4,
      created:        new Date().toJSON(),
      deadline:       new Date().toJSON(),
      retriesLeft:    4,
      routing:        "my.routing.key",
      owner:          "jonasfj@mozilla.com",
      runs:           [{
        runId:          0,
        state:          'pending',
        reasonCreated:  'new-task',
        scheduled:      new Date().toJSON()
      }]
    });
    assert(task instanceof Task, "Must have loaded correctly");

    // Let's serialize again
    var data = task.serialize();
    var task2 = Task.deserialize(data);
    assert(task2 instanceof Task, "Must have loaded correctly");

    // Compare status structures
    assert(_.isEqual(task.status(), task2.status()),
           "Status should change through serialization");
  });

  test("expireClaimsWithRetries", function() {
    var taskId = slugid.v4();
    return Task.dropTables().then(function() {
      return Task.ensureTables();
    }).then(function() {
      var takenUntil = new Date();
      takenUntil.setMinutes(takenUntil.getMinutes() - 10);
      return Task.create({
        version:        1,
        taskId:         taskId,
        provisionerId:  'provisioner-id',
        workerType:     'worker-type',
        priority:       5.4,
        created:        new Date().toJSON(),
        deadline:       new Date().toJSON(),
        retriesLeft:    4,
        routing:        "my.routing.key",
        owner:          "jonasfj@mozilla.com",
        runs:           [{
          runId:          0,
          state:          'running',
          reasonCreated:  'new-task',
          workerGroup:    'mygroup',
          workerId:       'myid',
          scheduled:      new Date(),
          started:        new Date(),
          takenUntil:     takenUntil.toJSON()
        }]
      });
    }).then(function() {
      return Task.expireClaimsWithoutRetries();
    }).then(function(tasks) {
      assert(tasks.length == 0, "Expected no tasks");
    }).then(function() {
      return Task.expireClaimsWithRetries();
    }).then(function(tasks) {
      assert(tasks.length == 1, "Expected 1 task");
      assert(tasks[0], "Expected 1 task");
      assert(tasks[0].taskId == taskId, "Expected taskId");
      assert(tasks[0].runs.length == 2, "Expected two runs");
      assert(tasks[0].runs[0].state == 'failed',  "1st run not failed");
      assert(tasks[0].runs[1].state == 'pending', "2nd run not pending");
    });
  });

  test("expireClaimsWithoutRetries", function() {
    var taskId = slugid.v4();
    return Task.dropTables().then(function() {
      return Task.ensureTables();
    }).then(function() {
      var takenUntil = new Date();
      takenUntil.setMinutes(takenUntil.getMinutes() - 10);
      return Task.create({
        version:        1,
        taskId:         taskId,
        provisionerId:  'provisioner-id',
        workerType:     'worker-type',
        priority:       5.4,
        created:        new Date().toJSON(),
        deadline:       new Date().toJSON(),
        retriesLeft:    0,
        routing:        "my.routing.key",
        owner:          "jonasfj@mozilla.com",
        runs:           [{
          runId:          0,
          state:          'running',
          reasonCreated:  'new-task',
          workerGroup:    'mygroup',
          workerId:       'myid',
          scheduled:      new Date(),
          started:        new Date(),
          takenUntil:     takenUntil.toJSON()
        }]
      });
    }).then(function() {
      return Task.expireClaimsWithRetries();
    }).then(function(tasks) {
      assert(tasks.length == 0, "Expected no tasks");
    }).then(function() {
      return Task.expireClaimsWithoutRetries();
    }).then(function(tasks) {
      assert(tasks.length == 1, "Expected 1 task");
      assert(tasks[0], "Expected 1 task");
      assert(tasks[0].taskId == taskId, "Expected taskId");
      assert(tasks[0].runs.length == 1, "Expected one run");
      assert(tasks[0].runs[0].state == 'failed',  "1st run not failed");
    });
  });

 test("expireByDeadline", function() {
    var taskId = slugid.v4();
    return Task.dropTables().then(function() {
      return Task.ensureTables();
    }).then(function() {
      var takenUntil = new Date();
      takenUntil.setMinutes(takenUntil.getMinutes() + 10);
      var deadline = new Date();
      deadline.setMinutes(deadline.getMinutes() - 10);
      return Task.create({
        version:        1,
        taskId:         taskId,
        provisionerId:  'provisioner-id',
        workerType:     'worker-type',
        priority:       5.4,
        created:        new Date().toJSON(),
        deadline:       deadline.toJSON(),
        retriesLeft:    5,
        routing:        "my.routing.key",
        owner:          "jonasfj@mozilla.com",
        runs:           [{
          runId:          0,
          state:          'running',
          reasonCreated:  'new-task',
          workerGroup:    'mygroup',
          workerId:       'myid',
          scheduled:      new Date(),
          started:        new Date(),
          takenUntil:     takenUntil.toJSON()
        }]
      });
    }).then(function() {
      return Task.expireClaimsWithRetries();
    }).then(function(tasks) {
      assert(tasks.length == 0, "Expected no tasks");
    }).then(function() {
      return Task.expireClaimsWithoutRetries();
    }).then(function(tasks) {
      assert(tasks.length == 0, "Expected no tasks");
    }).then(function() {
      return Task.expireByDeadline();
    }).then(function(tasks) {
      assert(tasks.length == 1, "Expected 1 task");
      assert(tasks[0], "Expected 1 task");
      assert(tasks[0].taskId == taskId, "Expected taskId");
      assert(tasks[0].runs.length == 1, "Expected one run");
      assert(tasks[0].runs[0].state == 'failed',  "1st run not failed");
    });
  });


  // test that we can move files
  test("moveTaskFromDatabase", function() {
    var taskId = slugid.v4();
    var storedTask = false;
    return Task.dropTables().then(function() {
      return Task.ensureTables();
    }).then(function() {
      var deadline = new Date();
      deadline.setDate(deadline.getDate() - 2);
      return Task.create({
        version:        1,
        taskId:         taskId,
        provisionerId:  'provisioner-id',
        workerType:     'worker-type',
        priority:       5.4,
        created:        new Date().toJSON(),
        deadline:       deadline.toJSON(),
        retriesLeft:    5,
        routing:        "my.routing.key",
        owner:          "jonasfj@mozilla.com",
        runs:           [{
          runId:          0,
          state:          'completed',
          reasonCreated:  'new-task',
          reaonReasolve:  'completed',
          success:        true,
          workerGroup:    'mygroup',
          workerId:       'myid',
          scheduled:      new Date(),
          started:        new Date(),
          takenUntil:     new Date().toJSON()
        }]
      });
    }).then(function() {
      return Task.moveTaskFromDatabase({
        store: function(task) {
          storedTask = true;
          assert(task.taskId == taskId, "Got right taskId");
        }
      }).then(function() {
        assert(storedTask, "Should have stored the task");
        return Task.load(taskId);
      }).then(function(task) {
        assert(task === null, "Task should not be in database anymore");
      });
    });
  });
});
