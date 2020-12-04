const assert = require('assert').strict;
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const { Backends } = require('../src/backends');
const { TestBackend } = require('../src/backends/test');
const { capitalize } = require('lodash');

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
    const backends = await new Backends();
    
    try{
      backends.setup({ cfg: {
        ...cfg,
        backends: {
          test1: { backendType: 'test', number: 1 },
          test2: { backendType: 'test', number: 2 },
        },
      }, db, monitor });
    }catch(err){
      console.log('uhoh');
      return;
    }
    
    try{
      assert(backends.get('test1') instanceof TestBackend);
      assert.equal(backends.get('test1').backendId, 'test1');
      assert(backends.get('test2') instanceof TestBackend);
      assert.equal(backends.get('test2').backendId, 'test2');
    }catch(err){
      this.monitor.reportError(err.message);
    }

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

  const testBackendMap = (title, { backendMap, check, rejects }) => {
    test(title, async function() {
      const backends = {
        t1: { backendType: 'test' },
        t2: { backendType: 'test' },
        t3: { backendType: 'test' },
      };

      const setup = () => new Backends().setup({
        cfg: { ...cfg, backends, backendMap },
        db,
        monitor,
      });

      if (rejects) {
        await assert.rejects(setup, rejects);
      } else {
        await check(await setup());
      }
    });
  };

  testBackendMap('fails when backendMap is a nonempty object', {
    backendMap: {
      t1: { when: { name: 'foo' } },
    },
    rejects: /must be an array, not an object/,
  });

  testBackendMap('fails when a match expr is missing backendId', {
    backendMap: [
      { when: { name: 'foo' } },
    ],
    rejects: /backendMap\[0\] is missing backendId or when/,
  });

  testBackendMap('fails when a match expr is missing when', {
    backendMap: [
      { backendId: 't2' },
    ],
    rejects: /backendMap\[0\] is missing backendId or when/,
  });

  testBackendMap('fails when a match expr specifies unknown backendId', {
    backendMap: [
      { backendId: 'nosuch', when: 'all' },
    ],
    rejects: /backendMap\[0\] has invalid backendId nosuch/,
  });

  testBackendMap('fails when a match expr has invalid parameter', {
    backendMap: [
      { backendId: 't1', when: { flavor: { is: 'purple' } } },
    ],
    rejects: /backendMap\[0\] has invalid match parameter flavor/,
  });

  testBackendMap('fails when a match expr has invalid pattern', {
    backendMap: [
      { backendId: 't1', when: { projectId: { random: 0.05 } } },
    ],
    rejects: /backendMap\[0\] has invalid pattern {"random":0\.05}/,
  });

  testBackendMap('find backend by name equality', {
    backendMap: [
      { backendId: 't1', when: { name: { is: 'one' } } },
      { backendId: 't2', when: { name: 'two' } },
    ],
    check: backends => {
      assert.equal(backends.forUpload({ name: 'one', projectId: 'x' }).backendId, 't1');
      assert.equal(backends.forUpload({ name: 'two', projectId: 'x' }).backendId, 't2');
      assert.equal(backends.forUpload({ name: 'onetwo', projectId: 'x' }), undefined);
    },
  });

  testBackendMap('find backend by regular expression on name', {
    backendMap: [
      // not anchored, so can appear anywhere in the name
      { backendId: 't1', when: { name: { regexp: 'public/.*' } } },
      // anchored to the beginning of the string
      { backendId: 't1', when: { name: { regexp: '^pubdocs/.*' } } },
    ],
    check: backends => {
      assert.equal(backends.forUpload({ name: 'public/foo', projectId: 'x' }).backendId, 't1');
      assert.equal(backends.forUpload({ name: 'pubdocs/bar', projectId: 'x' }).backendId, 't1');
      assert.equal(backends.forUpload({ name: 'prefix/public/bar', projectId: 'x' }).backendId, 't1');
      assert.equal(backends.forUpload({ name: 'prefix/pubdocs/bar', projectId: 'x' }), undefined);
    },
  });

  testBackendMap('find backend by name and projectId', {
    backendMap: [
      { backendId: 't1', when: { name: { regexp: 'proj1/.*' }, projectId: 'proj1' } },
    ],
    check: backends => {
      assert.equal(backends.forUpload({ name: 'proj1/foo', projectId: 'proj1' }).backendId, 't1');
      assert.equal(backends.forUpload({ name: 'proj1/foo', projectId: 'nomatch' }), undefined);
      assert.equal(backends.forUpload({ name: 'nomatch', projectId: 'proj1' }), undefined);
    },
  });

  testBackendMap('find backend finds the first match', {
    backendMap: [
      { backendId: 't1', when: { name: { regexp: '^projects/proj1/.*' } } },
      { backendId: 't2', when: { name: { regexp: '^projects/.*' } } },
    ],
    check: backends => {
      assert.equal(backends.forUpload({ name: 'projects/proj1/foo' }).backendId, 't1');
      assert.equal(backends.forUpload({ name: 'projects/proj2/foo' }).backendId, 't2');
    },
  });
});
