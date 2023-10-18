import assert from 'assert';
import debugFactory from 'debug';
const debug = debugFactory('index:test:api_test');
import helper from './helper.js';
import slugid from 'slugid';
import taskcluster from 'taskcluster-client';
import request from 'superagent';
import assume from 'assume';
import libUrls from 'taskcluster-lib-urls';
import testing from 'taskcluster-lib-testing';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  test('insert (and rank)', async function() {
    const myns = slugid.v4();
    const taskId = slugid.v4();
    const taskId2 = slugid.v4();
    await helper.index.insertTask(myns + '.my-task', {
      taskId: taskId,
      rank: 41,
      data: { hello: 'world' },
      expires: taskcluster.fromNow('25 minutes'),
    });
    let result = await helper.index.findTask(myns + '.my-task');
    assert(result.taskId === taskId, 'Wrong taskId');

    await helper.index.insertTask(myns + '.my-task', {
      taskId: taskId2,
      rank: 42,
      data: { hello: 'world - again' },
      expires: taskcluster.fromNow('25 minutes'),
    });
    result = await helper.index.findTask(myns + '.my-task');
    assert(result.taskId === taskId2, 'Wrong taskId');
  });

  test('find (non-existing)', async function() {
    const ns = slugid.v4() + '.' + slugid.v4();
    try {
      await helper.index.findTask(ns);
    } catch (err) {
      assert(err.statusCode === 404, 'Should have returned 404');
      return;
    }
    assert(false, 'This shouldn\'t have worked');
  });

  test('delete (non-existing)', async function() {
    const ns = slugid.v4() + '.' + slugid.v4();
    await helper.index.deleteTask(ns);
  });

  test('find (no scopes)', async function() {
    const myns = slugid.v4();
    const taskId = slugid.v4();
    await helper.index.insertTask(myns + '.my-task', {
      taskId: taskId,
      rank: 41,
      data: { hello: 'world' },
      expires: taskcluster.fromNow('25 minutes'),
    });
    helper.scopes('none');
    await assert.rejects(
      () => helper.index.findTask(myns + '.my-task'),
      err => err.code === 'InsufficientScopes');
  });

  test('delete (no scopes)', async function() {
    const ns = slugid.v4() + '.' + slugid.v4();
    helper.scopes('none');
    await assert.rejects(
      () => helper.index.deleteTask(ns),
      err => err.code === 'InsufficientScopes');
  });

  suite('listing things', function() {
    suiteSetup(async function() {
      if (skipping()) {
        this.skip();
      }
    });

    setup('insert tasks to list', async function() {
      if (skipping()) {
        return;
      }

      const paths = [
        'abc', 'abc.def', 'abc.def2',
        'bbc',
        'bbc.def',
        'cbc',
        'cbc.def',
        'dbc.def2',
      ];

      const expiredPaths = [
        'pqr', 'pqr.stu', 'pqr.stu2',
        'ppt', 'ppt.stu',
      ];

      const taskId = slugid.v4();

      await Promise.all([
        ...paths.map(path =>
          helper.index.insertTask(path, { taskId, rank: 13, data: {}, expires: taskcluster.fromNow('1 day') })),
        ...expiredPaths.map(path =>
          helper.index.insertTask(path, { taskId, rank: 13, data: {}, expires: taskcluster.fromNow('-1 day') })),
      ]);
    });

    const testValidNamespaces = function(list, VALID_PREFIXES = ['abc', 'bbc', 'cbc']) {
      const namespaces = [];
      const INVALID_PREFIXES = ['pqr', 'ppt'];
      list.forEach(function(ns) {
        namespaces.push(ns.namespace);
        assert(ns.namespace.indexOf('.') === -1, 'shouldn\'t have any dots');
      });

      VALID_PREFIXES.forEach(function(prefix) {
        assume(namespaces).contains(prefix);
      });

      INVALID_PREFIXES.forEach(function(prefix) {
        assume(namespaces).not.contains(prefix);
      });
    };

    test('list top-level namespaces', async function() {
      const result = await helper.index.listNamespaces('', {});
      testValidNamespaces(result.namespaces, ['abc', 'bbc', 'cbc', 'dbc']);
    });

    test('list top-level namespaces with continuation', async function() {
      const opts = { limit: 1 };
      let results = [];
      let iterations = 0;

      while (1) {
        iterations++;
        const result = await helper.index.listNamespaces('', opts);
        results = results.concat(result.namespaces);
        if (!result.continuationToken) {
          break;
        }
        opts.continuationToken = result.continuationToken;
      }
      assume(iterations).at.least(4);
      assert.equal(results.length, 4);
      testValidNamespaces(results, ['abc', 'bbc', 'cbc', 'dbc']);
    });

    test('list top-level namespaces (without auth)', async function() {
      helper.scopes('none');
      await assert.rejects(
        () => helper.index.listNamespaces('', {}),
        err => err.code === 'InsufficientScopes');
    });

    test('list top-level tasks', async function() {
      const result = await helper.index.listTasks('', {});
      testValidNamespaces(result.tasks);
    });

    test('list top-level tasks with continuation', async function() {
      const opts = { limit: 1 };
      let results = [];

      while (1) {
        const result = await helper.index.listTasks('', opts);
        results = results.concat(result.tasks);
        if (!result.continuationToken) {
          break;
        }
        opts.continuationToken = result.continuationToken;
      }

      assert.equal(results.length, 3);
      testValidNamespaces(results);
    });

    test('list top-level tasks', async function() {
      const result = await helper.index.listTasks('', {});
      testValidNamespaces(result.tasks);
    });

    test('list top-level tasks (without auth)', async function() {
      helper.scopes('none');
      await assert.rejects(
        () => helper.index.listTasks('', {}),
        err => err.code === 'InsufficientScopes');
    });

    test('findTask throws 404 for expired tasks', async function() {
      const myns = slugid.v4();
      const taskId = slugid.v4();
      const expired = new Date();
      expired.setDate(expired.getDate() - 1);
      const new_expires = expired.toJSON();

      await helper.index.insertTask(myns + '.my-task', {
        taskId: taskId,
        rank: 41,
        data: { hello: 'world' },
        expires: new_expires,
      });

      try {
        await helper.index.findTask(myns + '.my-task');
      } catch (err) {
        assert(err.statusCode === 404, 'Should have returned 404');
        return;
      }
    });
  });

  test('access artifact using anonymous scopes', async function() {
    const taskId = slugid.nice();
    debug('### Insert task into index');
    await helper.index.insertTask('my.name.space', {
      taskId: taskId,
      rank: 41,
      data: { hello: 'world' },
      expires: taskcluster.fromNowJSON('24 hours'),
    });

    debug('### Download xyz artifact using index');
    const url = helper.index.buildUrl(
      helper.index.findArtifactFromTask,
      'my.name.space',
      'xyz/abc.zip',
    );

    await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:xyz/abc.zip'], async () => {
      const res = await request.get(url).redirects(0).catch(function(err) {
        return err.response;
      });
      assert.equal(res.statusCode, 303, 'Expected 303 redirect');
      const location = res.headers.location.replace(/bewit=.*/, 'bewit=xyz');
      assert.equal(location,
        libUrls.api(helper.rootUrl, 'queue', 'v1', `/task/${taskId}/artifacts/xyz%2Fabc.zip?bewit=xyz`));
    });
  });

  test('access private artifact (with * scope)', async function() {
    const taskId = slugid.nice();
    debug('### Insert task into index');
    await helper.index.insertTask('my.name.space', {
      taskId: taskId,
      rank: 41,
      data: { hello: 'world' },
      expires: taskcluster.fromNowJSON('24 hours'),
    });

    debug('### Download private artifact using index');
    const url = helper.index.buildSignedUrl(
      helper.index.findArtifactFromTask,
      'my.name.space',
      'not-public/abc.zip',
    );
    const res = await request.get(url).redirects(0).catch(function(err) {
      return err.response;
    });
    assert.equal(res.statusCode, 303, 'Expected 303 redirect');
    const location = res.headers.location.replace(/bewit=.*/, 'bewit=xyz');
    assert.equal(location,
      libUrls.api(helper.rootUrl, 'queue', 'v1', `/task/${taskId}/artifacts/not-public%2Fabc.zip?bewit=xyz`));
  });

  test('access private artifact (with no scopes)', async function() {
    const taskId = slugid.nice();
    debug('### Insert task into index');
    await helper.index.insertTask('my.name.space', {
      taskId: taskId,
      rank: 41,
      data: { hello: 'world' },
      expires: taskcluster.fromNowJSON('24 hours'),
    });

    debug('### Download private artifact using index without queue:get-artifact:..');
    helper.scopes('some-scope');
    const url = helper.index.buildSignedUrl(
      helper.index.findArtifactFromTask,
      'my.name.space',
      'not-public/abc.zip',
    );
    const res = await request.get(url).redirects(0).catch(function(err) {
      return err.response;
    });
    assert.equal(res.statusCode, 403, 'Expected 403 Forbidden');
  });

  test('delete task', async function() {
    const taskId = slugid.nice();
    debug('### Insert task into index');
    await helper.index.insertTask('some.testing.name.space', {
      taskId: taskId,
      rank: 41,
      data: { hello: 'world' },
      expires: taskcluster.fromNowJSON('24 hours'),
    });

    let result = await helper.index.findTask('some.testing.name.space');
    assert(result.taskId === taskId, 'Wrong taskId');

    await helper.index.deleteTask('some.testing.name.space');

    await assert.rejects(
      () => helper.index.findTask('some.testing.name.space'),
      err => err.code === 'ResourceNotFound');

    // parent namespace still exists
    let listRes = await helper.index.listNamespaces('some.testing');
    assert.deepEqual(listRes.namespaces.map(({ name }) => name), ['name']);
  });
});
