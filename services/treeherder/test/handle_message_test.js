import assert from 'assert';
import path from 'path';
import {Handler} from '../lib/handler';
import Monitor from 'taskcluster-lib-monitor';
import validator from 'taskcluster-lib-validate';

let monitor;

suite('handle message', () => {
  suiteSetup(async () => {
    monitor = await Monitor({
      project: 'tc-treeherder-test',
      credentials: {},
      mock: true,
    });
  });

  test('invalid message - more than one matching route', async () => {
    let handler = new Handler({
      monitor: monitor,
      prefix: 'foo',
      queue: {
        task: (taskId) => {
          return {
            payload: {
              image: 'foo:latest',
            },
            extra: {
              treeherder: {
                reason: 'scheduled',
                tier: 1,
              },
            },
          };
        },
      },
    });

    let err;

    try {
      await handler.handleMessage({
        routes: ['foo.bar', 'foo.thing'],
        payload: {
          status: {
            taskId: 'abc',
          },
        },
      });
    } catch (e) {
      err = e;
    }

    assert(err, 'Error was not thrown');
    assert(err.message.includes('Could not determine treeherder route'));
  });

  test('invalid message - no matching route', async () => {
    let handler = new Handler({
      monitor: monitor,
      prefix: 'foo',
      queue: {
        task: (taskId) => {
          return {
            payload: {
              image: 'foo:latest',
            },
            extra: {
              treeherder: {
                reason: 'scheduled',
                tier: 1,
              },
            },
          };
        },
      },
    });
    let err;

    try {
      await handler.handleMessage({
        routes: ['foo1.bar', 'foo1.thing'],
        payload: {
          status: {
            taskId: 'abc',
          },
        },
      });
    } catch (e) {
      err = e;
    }

    assert(err, 'Error was not thrown');
    assert(err.message.includes('Could not determine treeherder route'));
  });

  test('invalid message - missing treeherder configuration', async () => {
    let called;
    let handler = new Handler({
      monitor: monitor,
      prefix: 'foo',
      queue: {
        task: (taskId) => {
          called = true;
          return {
            payload: {
              image: 'foo:latest',
            },
          };
        },
      },
    });

    await handler.handleMessage({
      routes: ['foo.bar.123'],
      payload: {
        status: {
          taskId: 'abc',
        },
      },
    });

    assert(called, 'Task was not retrieved by the queue');
    assert.equal(monitor.counts['tc-treeherder-test.validateTask.no-config'], 1);
  });

  test('invalid message - invalid treeherder config', async () => {
    let called;
    let handler = new Handler({
      monitor: monitor,
      prefix: 'foo',
      queue: {
        task: (taskId) => {
          called = true;
          return {
            payload: {
              image: 'foo:latest',
            },
            extra: {
              treeherder: {
                reason: 'scheduled',
                tier: 1,
              },
            },
          };
        },
      },
    });
    handler.validator = await validator({
      folder: path.join(__dirname, '..', 'schemas'),
      prefix: 'taskcluster-treeherder/v1/',
      aws:    {},
    });

    await handler.handleMessage({
      routes: ['foo.bar.123'],
      payload: {
        status: {
          taskId: 'abc',
        },
      },
    });

    assert(called, 'Task was retrieved by the queue');
    assert.equal(monitor.counts['tc-treeherder-test.validateTask.invalid-config'], 1);
  });
});
