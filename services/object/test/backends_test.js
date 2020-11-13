const assert = require('assert').strict;
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const { Backends } = require('../src/backends');
const { TestBackend } = require('../src/backends/test');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withBackends(mock, skipping);

  let db, monitor, cfg;
  setup(async function() {
    db = helper.db;
    monitor = await helper.load('monitor');
    cfg = await helper.load('cfg');
    helper.load.cfg('backends', {});
    helper.load.cfg('backendMap', []);
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
    assert.equal(backends.get('test1').backendId, 'test1');
    assert(backends.get('test2') instanceof TestBackend);
    assert.equal(backends.get('test2').backendId, 'test2');
  });

  test('get returns undefined for unknown backends', async function() {
    const backends = await new Backends().setup({ cfg: {
      ...cfg,
      backends: [],
    }, db, monitor });
    assert.deepEqual(backends.get('nosuch'), undefined);
  });

  test('backendMap can be an empty object', async function() {
    await new Backends().setup({ cfg: {
      ...cfg,
      backendMap: {},
    }, db, monitor });
    // doesn't throw..
  });

  test('find backend by name equality', async function() {
    const backends = await new Backends().setup({ cfg: {
      ...cfg,
      backends: {
        t1: { backendType: 'test' },
        t2: { backendType: 'test' },
      },
      backendMap: [
        { backendId: 't1', when: { name: { is: 'one' } } },
        { backendId: 't2', when: { name: 'two' } },
      ],
    }, db, monitor });

    assert.equal(backends.forUpload({ name: 'one', projectId: 'x' }).backendId, 't1');
    assert.equal(backends.forUpload({ name: 'two', projectId: 'x' }).backendId, 't2');
    assert.equal(backends.forUpload({ name: 'onetwo', projectId: 'x' }), undefined);
  });

  test('find backend by regular expression on name', async function() {
    const backends = await new Backends().setup({ cfg: {
      ...cfg,
      backends: {
        pub: { backendType: 'test' },
      },
      backendMap: [
        // not anchored, so can appear anywhere in the name
        { backendId: 'pub', when: { name: { regexp: 'public/.*' } } },
        // anchored to the beginning of the string
        { backendId: 'pub', when: { name: { regexp: '^pubdocs/.*' } } },
      ],
    }, db, monitor });

    assert.equal(backends.forUpload({ name: 'public/foo', projectId: 'x' }).backendId, 'pub');
    assert.equal(backends.forUpload({ name: 'pubdocs/bar', projectId: 'x' }).backendId, 'pub');
    assert.equal(backends.forUpload({ name: 'prefix/public/bar', projectId: 'x' }).backendId, 'pub');
    assert.equal(backends.forUpload({ name: 'prefix/pubdocs/bar', projectId: 'x' }), undefined);
  });

  test('find backend by name and projectId', async function() {
    const backends = await new Backends().setup({ cfg: {
      ...cfg,
      backends: {
        p1: { backendType: 'test' },
      },
      backendMap: [
        { backendId: 'p1', when: { name: { regexp: 'proj1/.*' }, projectId: 'proj1' } },
      ],
    }, db, monitor });

    assert.equal(backends.forUpload({ name: 'proj1/foo', projectId: 'proj1' }).backendId, 'p1');
    assert.equal(backends.forUpload({ name: 'proj1/foo', projectId: 'nomatch' }), undefined);
    assert.equal(backends.forUpload({ name: 'nomatch', projectId: 'proj1' }), undefined);
  });

  test('find backend finds the first match', async function() {
    const backends = await new Backends().setup({ cfg: {
      ...cfg,
      backends: {
        proj1: { backendType: 'test' },
        anyproj: { backendType: 'test' },
      },
      backendMap: [
        { backendId: 'proj1', when: { name: { regexp: '^projects/proj1/.*' } } },
        { backendId: 'anyproj', when: { name: { regexp: '^projects/.*' } } },
      ],
    }, db, monitor });

    assert.equal(backends.forUpload({ name: 'projects/proj1/foo' }).backendId, 'proj1');
    assert.equal(backends.forUpload({ name: 'projects/proj2/foo' }).backendId, 'anyproj');
  });

  // TODO: test various exception cases in setupMatching
});
