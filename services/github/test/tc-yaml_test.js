const TcYaml = require('../src/tc-yaml');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  suite('VersionZero', function() {
    const tcyaml = TcYaml.instantiate(0);
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

    test('compileTasks for a pull-request sets scopes correctly', function() {
      const config = {
        tasks: [{}],
      };

      tcyaml.compileTasks(config, cfg, {
        organization: 'org',
        repository: 'repo',
        details: { 'event.type': 'pull_request.opened' },
      }, now);
      assume(config.scopes.sort()).to.deeply.equal([
        'assume:repo:github.com/org/repo:pull-request',
        'queue:route:statuses-queue',
        'queue:scheduler-id:test-sched',
      ]);
    });

    test('compileTasks for a push sets scopes correctly', function() {
      const config = {
        tasks: [{}],
      };

      tcyaml.compileTasks(config, cfg, {
        organization: 'org',
        repository: 'repo',
        details: { 'event.type': 'push', 'event.base.repo.branch': 'master' },
      }, now);
      assume(config.scopes.sort()).to.deeply.equal([
        'assume:repo:github.com/org/repo:branch:master',
        'queue:route:statuses-queue',
        'queue:scheduler-id:test-sched',
      ]);
    });

    test('compileTasks for a tag sets scopes correctly', function() {
      const config = {
        tasks: [{}],
      };

      tcyaml.compileTasks(config, cfg, {
        organization: 'org',
        repository: 'repo',
        details: { 'event.type': 'tag', 'event.head.tag': 'v1.2.3' },
      }, now);
      assume(config.scopes.sort()).to.deeply.equal([
        'assume:repo:github.com/org/repo:tag:v1.2.3',
        'queue:route:statuses-queue',
        'queue:scheduler-id:test-sched',
      ]);
    });

    test('compileTasks for a release sets scopes correctly', function() {
      const config = {
        tasks: [{}],
      };

      tcyaml.compileTasks(config, cfg, {
        organization: 'org',
        repository: 'repo',
        details: { 'event.type': 'release' },
      }, now);
      assume(config.scopes.sort()).to.deeply.equal([
        'assume:repo:github.com/org/repo:release',
        'queue:route:statuses-queue',
        'queue:scheduler-id:test-sched',
      ]);
    });

  });

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
      assume(config.scopes.sort()).to.deeply.equal([
        'queue:route:statuses-queue',
        'queue:scheduler-id:test-sched',
      ]);
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
      assume(config.scopes.sort()).to.deeply.equal([
        'queue:route:statuses-queue',
        'queue:scheduler-id:test-sched',
      ]);
    });

    test('compileTasks for a pull-request sets scopes correctly', function() {
      const config = {
        tasks: [{}],
      };

      tcyaml.compileTasks(config, cfg, {
        tasks_for: 'github-pull-request',
        organization: 'org',
        repository: 'repo',
      }, now);
      assume(config.scopes.sort()).to.deeply.equal([
        'assume:repo:github.com/org/repo:pull-request',
        'queue:route:statuses-queue',
        'queue:scheduler-id:test-sched',
      ]);
    });

    test('compileTasks for a pull-request with checks sets scopes correctly', function() {
      const config = {
        tasks: [{}],
        reporting: 'checks',
      };

      tcyaml.compileTasks(config, cfg, {
        tasks_for: 'github-pull-request',
        organization: 'org',
        repository: 'repo',
      }, now);
      assume(config.scopes.sort()).to.deeply.equal([
        'assume:repo:github.com/org/repo:pull-request',
        'queue:route:checks-queue',
        'queue:scheduler-id:test-sched',
      ]);
    });

    test('compileTasks for a push sets scopes correctly', function() {
      const config = {
        tasks: [{}],
      };

      tcyaml.compileTasks(config, cfg, {
        tasks_for: 'github-push',
        organization: 'org',
        repository: 'repo',
        body: { ref: 'refs/heads/master' },
        details: { 'event.base.repo.branch': 'master' },
      }, now);
      assume(config.scopes.sort()).to.deeply.equal([
        'assume:repo:github.com/org/repo:branch:master',
        'queue:route:statuses-queue',
        'queue:scheduler-id:test-sched',
      ]);
    });

    test('compileTasks for a tag sets scopes correctly', function() {
      const config = {
        tasks: [{}],
      };

      tcyaml.compileTasks(config, cfg, {
        tasks_for: 'github-push',
        organization: 'org',
        repository: 'repo',
        body: { ref: 'refs/tags/v1.2.3' },
        details: { 'event.head.tag': 'v1.2.3' },
      }, now);
      assume(config.scopes.sort()).to.deeply.equal([
        'assume:repo:github.com/org/repo:tag:v1.2.3',
        'queue:route:statuses-queue',
        'queue:scheduler-id:test-sched',
      ]);
    });

    test('compileTasks for a release sets scopes correctly', function() {
      const config = {
        tasks: [{}],
      };

      tcyaml.compileTasks(config, cfg, {
        tasks_for: 'github-release',
        organization: 'org',
        repository: 'repo',
      }, now);
      assume(config.scopes.sort()).to.deeply.equal([
        'assume:repo:github.com/org/repo:release',
        'queue:route:statuses-queue',
        'queue:scheduler-id:test-sched',
      ]);
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

    test('compileTasks uses user-supplied taskId/taskGroupId/schedulerId', function() {
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
          schedulerId: 'my-scheduler-id',
          routes: ['statuses-queue'],
        },
      }, {
        taskId: 'task-2',
        task: {
          created: now,
          taskGroupId: 'tgid-2',
          schedulerId: 'my-scheduler-id',
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
            routes: ['statuses-queue', 'checks-queue'],
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
            routes: ['my-first-route', 'statuses-queue', 'my-second-route'],
          },
        }]);
      });
    });
  });
});
