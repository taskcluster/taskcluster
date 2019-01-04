const TcYaml = require('../src/tc-yaml');
const assume = require('assume');

suite('tc-yaml_test.js', function() {
  suite('VersionOne', function() {
    const tcyaml = TcYaml.instantiate(1);
    const cfg = {
      taskcluster: {
        schedulerId: 'test-sched',
      },
      app: {
        checkTaskRoute: 'checks-queue',
        statusTaskRoute: 'statuses-queue',
      },
    };
    const now = new Date().toJSON();

    test('compileTasks with no tasks', function() {
      const config = {
        tasks: [],
      };
      tcyaml.compileTasks(config, cfg, {}, now);
      assume(config.tasks).to.deeply.equal([]);
    });

    test('compileTasks with one task sets default properties', function() {
      const config = {
        tasks: [{}],
      };

      tcyaml.compileTasks(config, cfg, {}, now);
      assume(config.tasks).to.deeply.equal([{
        taskId: config.tasks[0].taskId,
        task: {
          created: now,
          taskGroupId: config.tasks[0].taskId, // matches taskId
          schedulerId: 'test-sched',
          routes: ['statuses-queue'],
        },
      }]);
    });

    test('compileTasks with one taskId sets taskGroupId', function() {
      const config = {
        tasks: [{
          taskId: 'task-1',
        }],
      };
      tcyaml.compileTasks(config, cfg, {}, now);
      assume(config.tasks).to.deeply.equal([{
        taskId: 'task-1',
        task: {
          created: now,
          taskGroupId: 'task-1',
          schedulerId: 'test-sched',
          routes: ['statuses-queue'],
        },
      }]);
    });

    test('compileTasks with taskGroupId and one task sets taskId', function() {
      const config = {
        tasks: [{
          taskGroupId: 'tgid-1',
        }],
      };
      tcyaml.compileTasks(config, cfg, {}, now);
      assume(config.tasks).to.deeply.equal([{
        taskId: 'tgid-1',
        task: {
          created: now,
          taskGroupId: 'tgid-1',
          schedulerId: 'test-sched',
          routes: ['statuses-queue'],
        },
      }]);
    });

    test('compileTasks with two tasks sets default properties', function() {
      const config = {
        tasks: [{}, {}],
      };
      tcyaml.compileTasks(config, cfg, {}, now);
      // taskGroupIds match
      assume(config.tasks[0].task.taskGroupId).to.equal(config.tasks[1].task.taskGroupId);
      // taskIds don't
      assume(config.tasks[0].taskId).to.not.equal(config.tasks[1].taskId);
      // taskGroupId does not match any taskId
      assume(config.tasks[0].taskId).to.not.equal(config.tasks[0].task.taskGroupId);
      assume(config.tasks[1].taskId).to.not.equal(config.tasks[1].task.taskGroupId);
    });

    test('compileTasks forces schedulerId, but uses user-supplied taskId/taskGroupId', function() {
      const config = {
        tasks: [{
          taskId: 'task-1',
          taskGroupId: 'tgid-1',
          schedulerId: 'my-scheduler-id',
        }, {
          taskId: 'task-2',
          taskGroupId: 'tgid-2',
          schedulerId: 'my-scheduler-id',
        }],
      };
      tcyaml.compileTasks(config, cfg, {}, now);
      assume(config.tasks).to.deeply.equal([{
        taskId: 'task-1',
        task: {
          created: now,
          taskGroupId: 'tgid-1',
          schedulerId: 'test-sched',
          routes: ['statuses-queue'],
        },
      }, {
        taskId: 'task-2',
        task: {
          created: now,
          taskGroupId: 'tgid-2',
          schedulerId: 'test-sched',
          routes: ['statuses-queue'],
        },
      }]);
    });

    suite('status/checks routes', function() {
      test('compileTasks sets checks route if we have reporting in the YML', function() {
        const config = {
          tasks: [{
            taskId: 'task-1',
          }],
          reporting: 'checks-v1',
        };
        tcyaml.compileTasks(config, cfg, {}, now);
        assume(config.tasks).to.deeply.equal([{
          taskId: 'task-1',
          task: {
            created: now,
            taskGroupId: 'task-1',
            schedulerId: 'test-sched',
            routes: ['checks-queue'],
          },
        }]);
      });

      test('compileTasks sets statuses route by default', function() {
        const config = {
          tasks: [{
            taskId: 'task-1',
          }],
        };
        tcyaml.compileTasks(config, cfg, {}, now);
        assume(config.tasks).to.deeply.equal([{
          taskId: 'task-1',
          task: {
            created: now,
            taskGroupId: 'task-1',
            schedulerId: 'test-sched',
            routes: ['statuses-queue'],
          },
        }]);
      });

      test('compileTasks sets statuses just once', function() {
        const config = {
          tasks: [{
            taskId: 'task-1',
            routes: ['statuses-queue'],
          }],
        };
        tcyaml.compileTasks(config, cfg, {}, now);
        assume(config.tasks).to.deeply.equal([{
          taskId: 'task-1',
          task: {
            created: now,
            taskGroupId: 'task-1',
            schedulerId: 'test-sched',
            routes: ['statuses-queue'],
          },
        }]);
      });

      test('compileTasks allows both statuses and checks to be defined', function() {
        const config = {
          tasks: [{
            taskId: 'task-1',
            routes: ['statuses-queue'],
          }],
          reporting: 'checks-v1',
        };
        tcyaml.compileTasks(config, cfg, {}, now);
        assume(config.tasks).to.deeply.equal([{
          taskId: 'task-1',
          task: {
            created: now,
            taskGroupId: 'task-1',
            schedulerId: 'test-sched',
            routes: ['checks-queue', 'statuses-queue'],
          },
        }]);
      });

      test('compileTasks does not erase existing routes', function() {
        const config = {
          tasks: [{
            taskId: 'task-1',
            routes: ['my-first-route', 'statuses-queue', 'my-second-route'],
          }],
        };
        tcyaml.compileTasks(config, cfg, {}, now);
        assume(config.tasks).to.deeply.equal([{
          taskId: 'task-1',
          task: {
            created: now,
            taskGroupId: 'task-1',
            schedulerId: 'test-sched',
            routes: ['statuses-queue', 'my-first-route', 'my-second-route'],
          },
        }]);
      });
    });
  });
});
