const assert = require('assert');
const debug = require('debug')('index:test:api_test');
const helper = require('./helper');
const slugid = require('slugid');
const taskcluster = require('taskcluster-client');
const request = require('superagent');
const assume = require('assume');
const libUrls = require('taskcluster-lib-urls');

helper.secrets.mockSuite('api_test.js', ['taskcluster'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);

  test('insert (and rank)', async function() {
    const myns    = slugid.v4();
    const taskId  = slugid.v4();
    const taskId2  = slugid.v4();
    await helper.index.insertTask(myns + '.my-task', {
      taskId:     taskId,
      rank:       41,
      data:       {hello: 'world'},
      expires:    taskcluster.fromNow('25 minutes'),
    });
    let result = await helper.index.findTask(myns + '.my-task');
    assert(result.taskId === taskId, 'Wrong taskId');

    await helper.index.insertTask(myns + '.my-task', {
      taskId:     taskId2,
      rank:       42,
      data:       {hello: 'world - again'},
      expires:    taskcluster.fromNow('25 minutes'),
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

      const expired_paths = [
        'pqr', 'pqr.stu', 'pqr.stu2',
        'ppt', 'ppt.stu',    
      ];

      const taskId = slugid.v4();

      for (let path of paths) {
        await helper.index.insertTask(path, {taskId, rank: 13, data: {}, expires: taskcluster.fromNow('1 day')});
      }

      for (let path of expired_paths) {
        await helper.index.insertTask(path, {taskId, rank: 13, data: {}, expires: taskcluster.fromNow('-1 day')});
      }
    });

    const testValidNamespaces = function(list, VALID_PREFIXES=['abc', 'bbc', 'cbc']) {
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
      const opts = {limit: 1};
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
      const result = await helper.index.listNamespaces('', {});
      testValidNamespaces(result.namespaces, ['abc', 'bbc', 'cbc', 'dbc']);
    });

    test('list top-level tasks', async function() {
      const result = await helper.index.listTasks('', {});
      testValidNamespaces(result.tasks);
    });

    test('list top-level tasks with continuation', async function() {
      const opts = {limit: 1};
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

    test('list top-level tasks (without auth)', async function() {
      helper.scopes('none');
      const result = await helper.index.listTasks('', {});
      testValidNamespaces(result.tasks);
    });

    test('list top-level tasks', async function() {
      const result = await helper.index.listTasks('', {});
      testValidNamespaces(result.tasks);
    });

    test('findTask throws 404 for expired tasks', async function() {
      const myns    = slugid.v4();
      const taskId  = slugid.v4();
      const expired = new Date();
      expired.setDate(expired.getDate() - 1);
      const new_expires = expired.toJSON();

      await helper.index.insertTask(myns + '.my-task', {
        taskId:     taskId,
        rank:       41,
        data:       {hello: 'world'},
        expires:    new_expires,
      });

      try {
        await helper.index.findTask(myns + '.my-task');
      } catch (err) {
        assert(err.statusCode === 404, 'Should have returned 404');
        return;
      }
    });
  });

  test('access public artifact', async function() {
    const taskId = slugid.nice();
    debug('### Insert task into index');
    await  helper.index.insertTask('my.name.space', {
      taskId:     taskId,
      rank:       41,
      data:       {hello: 'world'},
      expires:    taskcluster.fromNowJSON('24 hours'),
    });

    debug('### Download public artifact using index');
    const url = helper.index.buildUrl(
      helper.index.findArtifactFromTask,
      'my.name.space',
      'public/abc.zip'
    );
    const res = await request.get(url).redirects(0).catch(function(err) {
      return err.response;
    });
    assert.equal(res.statusCode, 303, 'Expected 303 redirect');
    assert.equal(res.headers.location,
      libUrls.api(helper.rootUrl, 'queue', 'v1', `/task/${taskId}/artifacts/public%2Fabc.zip`));
  });

  test('access private artifact (with * scope)', async function() {
    const taskId = slugid.nice();
    debug('### Insert task into index');
    await  helper.index.insertTask('my.name.space', {
      taskId:     taskId,
      rank:       41,
      data:       {hello: 'world'},
      expires:    taskcluster.fromNowJSON('24 hours'),
    });

    debug('### Download private artifact using index');
    const url = helper.index.buildSignedUrl(
      helper.index.findArtifactFromTask,
      'my.name.space',
      'not-public/abc.zip'
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
      taskId:     taskId,
      rank:       41,
      data:       {hello: 'world'},
      expires:    taskcluster.fromNowJSON('24 hours'),
    });

    debug('### Download private artifact using index without queue:get-artifact:..');
    helper.scopes('some-scope');
    const url = helper.index.buildSignedUrl(
      helper.index.findArtifactFromTask,
      'my.name.space',
      'not-public/abc.zip'
    );
    const res = await request.get(url).redirects(0).catch(function(err) {
      return err.response;
    });
    assert.equal(res.statusCode, 403, 'Expected 403 Forbidden');
  });
});
