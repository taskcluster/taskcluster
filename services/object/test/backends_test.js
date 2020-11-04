const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const { Backends } = require('../src/backends');
const { TestBackend } = require('../src/backends/test');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);

  let db, monitor, cfg;
  setup(async function() {
    db = helper.db;
    monitor = await helper.load('monitor');
    cfg = await helper.load('cfg');
  });

  test('fails when unknown backend type is given', async function() {
    await assert.rejects(
      () => new Backends().setup({ cfg: {
        ...cfg,
        backends: {
          test: { backendType: 'no-such' },
        },
      }, db, monitor }),
      /Unknown backendType/);
  });

  test('sets up multiple backends with the same type', async function() {
    const backends = await new Backends().setup({ cfg: {
      ...cfg,
      backends: {
        test1: { backendType: 'test', number: 1 },
        test2: { backendType: 'test', number: 2 },
      },
    }, db, monitor });
    assert(backends.get('test1') instanceof TestBackend);
    assert(backends.get('test2') instanceof TestBackend);
  });

  test('get returns undefined for unknown backends', async function() {
    const backends = await new Backends().setup({ cfg: {
      ...cfg,
      backends: {
      },
    }, db, monitor });
    assert.deepEqual(backends.get('nosuch'), undefined);
  });
});
