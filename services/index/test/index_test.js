suite('Indexing', () => {
  var assert      = require('assert');
  var debug       = require('debug')('index:test:index_test');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var testing     = require('taskcluster-lib-testing');
  var taskcluster = require('taskcluster-client');
  var data = require('../src/data');

  var makeTask = function() {
    return {
      provisionerId: 'dummy-test-provisioner',
      workerType: 'dummy-test-worker-type',
      scopes: [],
      routes: [
        helper.routePrefix + '.',
        helper.routePrefix + '.my-ns',
        helper.routePrefix + '.my-ns.my-indexed-thing',
        helper.routePrefix + '.my-ns.my-indexed-thing-again',
        helper.routePrefix + '.my-ns.one-ns.my-indexed-thing',
        helper.routePrefix + '.my-ns.another-ns.my-indexed-thing-again',
        helper.routePrefix + '.my-ns.slash/things-are-ignored',
      ],
      retries: 3,
      created: (new Date()).toJSON(),
      deadline: (new Date()).toJSON(),
      payload: {},
      metadata: {
        name: 'Print `"Hello World"` Once',
        description: 'This task will prìnt `"Hello World"` **once**!',
        owner: 'jojensen@mozilla.com',
        source: 'https://github.com/taskcluster/taskcluster-index',
      },
      tags: {
        objective: 'Test task indexing',
      },
    };
  };

  test('Run task and test indexing', async function() {
    var taskId = slugid.nice();
    var task = makeTask();
    helper.queue.addTask(taskId, task);

    debug('### Send fake message, taskid ' + taskId);
    const message = {
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'ignored',
      routes: task.routes,
      payload: {
        status: {taskId},
      },
    };
    helper.handlers.listener.fakeMessage(message);

    debug('### Find task in index');
    let result = await testing.poll(function() {
      return helper.index.findTask('my-ns.my-indexed-thing');
    });
    assert.equal(result.taskId, taskId, 'Wrong taskId');

    debug('### Find task in index (again)');
    result = await helper.index.findTask('my-ns');
    assert.equal(result.taskId, taskId, 'Wrong taskId');

    debug('### Find task in index (again)');
    result = await helper.index.findTask('my-ns.my-indexed-thing-again');
    assert.equal(result.taskId, taskId, 'Wrong taskId');

    debug('### List task in namespace');
    result = await helper.index.listTasks('my-ns', {});
    assert.equal(result.tasks.length, 2, 'Expected 2 tasks');
    result.tasks.forEach(function(task) {
      assert.equal(task.taskId, taskId, 'Wrong taskId');
    });

    debug('### List namespaces in namespace');
    result = await helper.index.listNamespaces('my-ns', {});
    assert.equal(result.namespaces.length, 2, 'Expected 2 namespaces');
    assert(result.namespaces.some(function(ns) {
      return ns.name === 'one-ns';
    }), 'Expected to find one-ns');
    assert(result.namespaces.some(function(ns) {
      return ns.name === 'another-ns';
    }), 'Expected to find another-ns');

    debug('### Find task in index');
    await helper.index.findTask(
      'my-ns.slash/things-are-ignored'
    ).then(function() {
      assert(false, 'Expected ill formated namespaces to be ignored!');
    }, function(err) {
      assert.equal(err.statusCode, 400, 'Expected 400');
    });
  });

  test('Run task with a .extra and test indexing', async function() {
    var taskId = slugid.nice();
    var task = makeTask();
    task.extra = {
      index: {
        rank:       42,
        expires:    taskcluster.fromNow('1 hour'),
        data: {
          hello:    'world',
        },
      },
    };
    helper.queue.addTask(taskId, task);

    debug('### Send fake message');
    const message = {
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'ignored',
      routes: task.routes,
      payload: {
        status: {taskId},
      },
    };
    helper.handlers.listener.fakeMessage(message);

    debug('### Find task in index');
    let result = await testing.poll(function() {
      return helper.index.findTask('my-ns.my-indexed-thing');
    });
    assert.equal(result.taskId, taskId, 'Wrong taskId');
    assert.equal(result.rank, 42, 'Expected rank 42');
    assert.equal(result.data.hello, 'world', 'Expected data');

    debug('### Find task in index (again)');
    result = await helper.index.findTask('my-ns.my-indexed-thing-again');
    assert.equal(result.taskId, taskId, 'Wrong taskId');
  });

  test('Expiring Indexed Tasks', async function() {
    // Create expiration
    var expiry = new Date();

    expiry.setDate(expiry.getDate() - 1);
    
    var myns     = slugid.v4();
    var taskId   = slugid.v4();
    var taskId2  = slugid.v4();
    await helper.index.insertTask(myns + '.my-task', {
      taskId:     taskId,
      rank:       41,
      data:       {hello: 'world'},
      expires:    expiry.toJSON(),
    });
    let result = await helper.index.findTask(myns + '.my-task');
    assert(result.taskId === taskId, 'Wrong taskId');

    expiry.setDate(expiry.getDate() + 1);
    await helper.index.insertTask(myns + '.my-task2', {
      taskId:     taskId2,
      rank:       42,
      data:       {hello: 'world two'},
      expires:    expiry.toJSON(),
    });
    result = await helper.index.findTask(myns + '.my-task2');
    assert(result.taskId === taskId2, 'Wrong taskId');
    
    // Set now to one day in the past 
    var now = taskcluster.fromNow('- 1 day');
    debug('Expiring indexed tasks at: %s, from before %s', new Date(), now);
    await helper.handlers.IndexedTask.expireTasks(now);
    
    try {
      await helper.index.findTask(myns + '.my-task');
    } catch (err) {
      assert(err.statusCode === 404, 'Should have returned 404');
      return;
    }    
    assert(false, 'This shouldn\'t have worked');

  });

  test('Expiring Namespace', async function() {
    // Create expiration
    var expiry = new Date();
    var myns     = slugid.v4();
    var taskId   = slugid.v4();
    var taskId2  = slugid.v4();
    await helper.index.insertTask(myns+'.one-ns.my-task', {
      taskId:     taskId,
      rank:       41,
      data:       {hello: 'world'},
      expires:    expiry.toJSON(),
    });
    let result = await helper.index.findTask(myns + '.one-ns.my-task');
    assert(result.taskId === taskId, 'Wrong taskId');
    expiry.setDate(expiry.getDate() - 2);
    await helper.index.insertTask(myns + '.another-ns.my-task', {
      taskId:     taskId2,
      rank:       42,
      data:       {hello: 'world two'},
      expires:    expiry.toJSON(),
    });
    result = await helper.index.findTask(myns + '.another-ns.my-task');
    assert(result.taskId === taskId2, 'Wrong taskId');
    // Set now to one day in the past 
    var now = taskcluster.fromNow('- 1 day');
    
    debug('Expiring namespace at: %s, from before %s', new Date(), now);
    await helper.handlers.Namespace.expireEntries(now);
    
    result = await helper.index.listNamespaces(myns, {});
    assert.equal(result.namespaces.length, 1, 'Expected 1 namespace');
    assert(result.namespaces.some(function(ns) {
      return ns.name === 'one-ns';
    }), 'Expected to find one-ns');
    
  });

  var insert10Tasks = async function(myns) {
    var expiry = new Date();
    expiry.setDate(expiry.getDate() + 10);
    var res = [];
    for (var i = 1; i <= 10; i++) {
      let taskId = slugid.nice();
      await helper.index.insertTask(myns + '.my-task' + _.toString(i) + '.new' + _.toString(i), {
        taskId:     taskId,
        rank:       i,
        data:       {hello: 'world ' + _.toString(i)},
        expires:    expiry.toJSON(),
      });
      let result = await helper.index.findTask(myns + '.my-task' + _.toString(i) + '.new' + _.toString(i));
      res.push(result);
      assert(result.taskId === taskId, 'Wrong taskId');
    }
    return res;
  };

  test('list top-level namespaces test limit and continuationToken params', async function() {
    var myns = slugid.v4();
    let tasks = await insert10Tasks(myns);
    debug('listNamespaces returns continuationToken after limit = 10');

    let i = 1;
    let continuationToken = undefined;
    do {
      let query = {limit: 1};
      if (!_.isUndefined(continuationToken)) {
        _.extend(query, {continuationToken});
      }
      let result = await helper.index.listNamespaces(myns, query);
      debug('listNamespaces returns 1 entry');
      assert.equal(result.namespaces.length, 1, 'Expected 1 namespace');
      let obj = result.namespaces[0];
      debug('listNamespaces entries match the namespace regex');
      assert.equal(
        new RegExp(myns + '.my-task').test(obj.namespace) &&
        new RegExp('my-task').test(obj.name),
        true, 'Expect namespace to match regex');
      continuationToken = result.continuationToken;
      i ++;
    }
    while (!_.isUndefined(continuationToken));
    assert(i >= 10, 'continuationToken is valid till 10 listNamespaces');
  });

});
