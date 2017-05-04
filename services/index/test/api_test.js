suite("API", () => {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('index:test:api_test');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var taskcluster = require('taskcluster-client');
  var request     = require('superagent-promise')(require('superagent'), Promise);

  // Artifact names that we have assigned scopes to testing credentials for.
  var publicArtifactName = 'public/dummy-test-provisioner.log';
  var privateArtifactName = 'private/dummy-test-provisioner.log';

  // Create expiration
  var expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 25);

  test('insert (and rank)', async function() {
    var myns    = slugid.v4();
    var taskId  = slugid.v4();
    var taskId2  = slugid.v4();
    await helper.index.insertTask(myns + '.my-task', {
      taskId:     taskId,
      rank:       41,
      data:       {hello: "world"},
      expires:    expiry.toJSON()
    });
    let result = await helper.index.findTask(myns + '.my-task');
    assert(result.taskId === taskId, "Wrong taskId");

    await helper.index.insertTask(myns + '.my-task', {
      taskId:     taskId2,
      rank:       42,
      data:       {hello: "world - again"},
      expires:    expiry.toJSON()
    });
    result = await helper.index.findTask(myns + '.my-task');
    assert(result.taskId === taskId2, "Wrong taskId");
  });

  test('find (non-existing)', async function() {
    var ns = slugid.v4() + '.' + slugid.v4();
    try {
      await helper.index.findTask(ns)
    } catch (err) {
      assert(err.statusCode === 404, "Should have returned 404");
      return;
    }
    assert(false, "This shouldn't have worked");
  });

  test('list top-level namespaces', async function() {
    let result = await helper.index.listNamespaces('', {});
    result.namespaces.forEach(function(ns) {
      assert(ns.namespace.indexOf('.') === -1, "shouldn't have any dots");
    });
  });

  test('list top-level namespaces (without auth)', async function() {
    var index = new helper.Index();
    let result = await index.listNamespaces('', {});
    result.namespaces.forEach(function(ns) {
      assert(ns.namespace.indexOf('.') === -1, "shouldn't have any dots");
    });
  });

  test('list top-level tasks', async function() {
    let result = await helper.index.listTasks('', {});
    result.tasks.forEach(function(task) {
      assert(task.namespace.indexOf('.') === -1, "shouldn't have any dots");
    });
  });

  test('list top-level tasks (without auth)', async function() {
    var index = new helper.Index();
    let result = await index.listTasks('', {});
    result.tasks.forEach(function(task) {
      assert(task.namespace.indexOf('.') === -1, "shouldn't have any dots");
    });
  });

  test('access public artifact', async function() {
    let taskId = slugid.nice();
    debug("### Insert task into index");
    await  helper.index.insertTask('my.name.space', {
      taskId:     taskId,
      rank:       41,
      data:       {hello: "world"},
      expires:    taskcluster.fromNowJSON('24 hours')
    });

    debug("### Download public artifact using index");
    var url = helper.index.buildUrl(
      helper.index.findArtifactFromTask,
      'my.name.space',
      'public/abc.zip'
    );
    var res = await request.get(url).redirects(0).end().catch(function(err) {
      return err.response;
    });
    assert.equal(res.statusCode, 303, "Expected 303 redirect");
    assert.equal(res.headers.location, `https://queue.taskcluster.net/v1/task/${taskId}/artifacts/public%2Fabc.zip`);
  });

  test('access private artifact (with * scope)', async function() {
    let taskId = slugid.nice();
    debug("### Insert task into index");
    await  helper.index.insertTask('my.name.space', {
      taskId:     taskId,
      rank:       41,
      data:       {hello: "world"},
      expires:    taskcluster.fromNowJSON('24 hours')
    });

    debug("### Download private artifact using index");
    var url = helper.index.buildSignedUrl(
      helper.index.findArtifactFromTask,
      'my.name.space',
      'not-public/abc.zip'
    );
    var res = await request.get(url).redirects(0).end().catch(function(err) {
      return err.response;
    });
    assert.equal(res.statusCode, 303, "Expected 303 redirect");
    let location = res.headers.location.replace(/bewit=.*/, 'bewit=xyz');
    assert.equal(location, `https://queue.taskcluster.net/v1/task/${taskId}/artifacts/not-public%2Fabc.zip?bewit=xyz`);
  });

  test('access private artifact (with no scopes)', async function() {
    let taskId = slugid.nice();
    debug("### Insert task into index");
    await  helper.index.insertTask('my.name.space', {
      taskId:     taskId,
      rank:       41,
      data:       {hello: "world"},
      expires:    taskcluster.fromNowJSON('24 hours')
    });

    debug("### Download private artifact using index with no scopes");
    var index = new taskcluster.Index({
      baseUrl: helper.baseUrl,
      credentials: {
        clientId: 'public-only-client',
        accessToken: 'none',
      },
    });
    var url = index.buildSignedUrl(
      helper.index.findArtifactFromTask,
      'my.name.space',
      'not-public/abc.zip'
    );
    var res = await request.get(url).redirects(0).end().catch(function(err) {
      return err.response;
    });
    assert.equal(res.statusCode, 403, "Expected 403 Forbidden");
  });
});


