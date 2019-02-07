const request = require('superagent');
const assert = require('assert');
const Promise = require('promise');
const APIBuilder = require('../');
const Monitor = require('taskcluster-lib-monitor');
const helper = require('./helper');
const libUrls = require('taskcluster-lib-urls');

suite('api/responsetimer', function() {
  // Create test api
  const builder = new APIBuilder({
    title: 'Test Api',
    description: 'Another test api',
    serviceName: 'test',
    apiVersion: 'v1',
  });

  builder.declare({
    method: 'get',
    route: '/single-param/:myparam',
    name: 'testParam',
    title: 'Test End-Point',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send(req.params.myparam);
  });

  builder.declare({
    method: 'get',
    route: '/slash-param/:name(*)',
    name: 'testSlashParam',
    title: 'Test End-Point',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.status(404).send(req.params.name);
  });

  builder.declare({
    method: 'get',
    route: '/another-param/:name(*)',
    name: 'testAnotherParam',
    title: 'Test End-Point',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.status(500).send(req.params.name);
  });

  // Reference for test api server
  let _apiServer = null;
  let monitor = null;

  // Create a mock authentication server
  setup(async () => {
    monitor = new Monitor({
      projectName: 'tc-lib-api-test',
      mock: true,
    });

    await helper.setupServer({builder, monitor: monitor.prefix('api')});
  });
  teardown(() => {
    monitor.terminate();
    helper.teardownServer();
  });

  test('single parameter', async function() {
    const u = path => libUrls.api(helper.rootUrl, 'test', 'v1', path);
    await request.get(u('/single-param/Hello')),
    await request.get(u('/single-param/Goodbye')),
    await request.get(u('/slash-param/Slash')).catch(err => {}),
    await request.get(u('/another-param/Another')).catch(err => {}),
    assert.equal(monitor.events.length, 4);
    monitor.events.forEach(event => {
      assert.equal(event.Type, 'monitor.express');
      assert.equal(event.Logger, 'tc-lib-api-test.root.api');
    });
    assert.equal(monitor.events[0].Fields.name, 'testParam');
    assert.equal(monitor.events[0].Fields.statusCode, 200);
    assert.equal(monitor.events[1].Fields.name, 'testParam');
    assert.equal(monitor.events[1].Fields.statusCode, 200);
    assert.equal(monitor.events[2].Fields.name, 'testSlashParam');
    assert.equal(monitor.events[2].Fields.statusCode, 404);
    assert.equal(monitor.events[3].Fields.name, 'testAnotherParam');
    assert.equal(monitor.events[3].Fields.statusCode, 500);
  });
});
