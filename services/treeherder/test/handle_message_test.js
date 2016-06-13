import assert from 'assert';
import path from 'path';
import { Handler } from '../lib/handler';
import base from 'taskcluster-base';

let monitor;

suite('handle message', () => {
  suiteSetup(async () => {
    monitor = await base.monitor({
      project: 'tc-treeherder-test',
      credentials: {},
      mock: true
    });
  })

  test('invalid message - more than one matching route', async () => {
    let handler = new Handler({
      monitor: monitor,
      prefix: 'foo',
      queue: {
        task: (taskId) => {
          return {
            payload: {
              image: 'foo:latest'
            },
            extra: {
              treeherder: {
                reason: "scheduled",
                tier: 1
              }
            }
          };
        }
      }
    });

    let err;

    try {
      await handler.handleMessage({
        routes: ['foo.bar', 'foo.thing'],
        payload: {
          status: {
            taskId: 'abc',
          }
        }
      })
    } catch(e) {
      err = e;
    }

    assert(err, 'Error was not thrown');
    assert(err.message.includes("Could not determine treeherder route"));
  });


  test('invalid message - no matching route', async () => {
    let handler = new Handler({
      monitor: monitor,
      prefix: 'foo',
      queue: {
        task: (taskId) => {
          return {
            payload: {
              image: 'foo:latest'
            },
            extra: {
              treeherder: {
                reason: "scheduled",
                tier: 1
              }
            }
          };
        }
      }
    });
    let err;

    try {
      await handler.handleMessage({
        routes: ['foo1.bar', 'foo1.thing'],
        payload: {
          status: {
            taskId: 'abc',
          }
        }
      })
    } catch(e) {
      err = e;
    }

    assert(err, 'Error was not thrown');
    assert(err.message.includes("Could not determine treeherder route"));
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
              image: 'foo:latest'
            }
          };
        }
      }
    });
    let err;

    try {
      await handler.handleMessage({
        routes: ['foo.bar.123'],
        payload: {
          status: {
            taskId: 'abc',
          }
        }
      })
    } catch(e) {
      err = e;
    }

    assert(err, 'Error was not thrown');
    assert(called, 'Task was not retrieved by the queue');
    assert(err.message.includes("Message is missing Treeherder job configuration"));
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
              image: 'foo:latest'
            },
            extra: {
              treeherder: {
                reason: "scheduled",
                tier: 1
              }
            }
          };
        }
      },
    });
    handler.validator = await base.validator({
        folder: path.join(__dirname, '..', 'schemas'),
        prefix: 'taskcluster-treeherder/v1/',
        aws:    {}
    });

    let err;
    try {
      await handler.handleMessage({
        routes: ['foo.bar.123'],
        payload: {
          status: {
            taskId: 'abc'
          }
        }
      })
    } catch(e) {
      err = e;
    }

    assert(err, 'Error was not thrown');
    assert(called, 'Task was retrieved by the queue');
    assert(err.message.includes("Message contains an invalid Treeherder job configuration"));
  });
});
