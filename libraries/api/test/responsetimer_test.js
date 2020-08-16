const request = require('superagent');
const assert = require('assert');
const { APIBuilder } = require('../');
const helper = require('./helper');
const libUrls = require('taskcluster-lib-urls');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  setup(async function() {
    await helper.setupServer({ builder });
  });
  teardown(helper.teardownServer);

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
    category: 'API Library',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send(req.params.myparam);
  });

  builder.declare({
    method: 'get',
    route: '/slash-param/:name(*)',
    name: 'testSlashParam',
    title: 'Test End-Point',
    category: 'API Library',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.status(404).send(req.params.name);
  });

  builder.declare({
    method: 'get',
    route: '/another-param/:name(*)',
    name: 'testAnotherParam',
    title: 'Test End-Point',
    category: 'API Library',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.status(500).send(req.params.name);
  });

  test('single parameter', async function() {
    const u = path => libUrls.api(helper.rootUrl, 'test', 'v1', path);
    await request.get(u('/single-param/Hello')),
    await request.get(u('/single-param/Goodbye')),
    await request.get(u('/slash-param/Slash')).catch(err => {}),
    await request.get(u('/another-param/Another')).catch(err => {}),
    assert.equal(helper.monitorManager.messages.length, 4);
    helper.monitorManager.messages.forEach(event => {
      assert.equal(event.Type, 'monitor.apiMethod');
      assert.equal(event.Logger, 'taskcluster.lib-api');
    });
    assert.equal(helper.monitorManager.messages[0].Fields.name, 'testParam');
    assert.equal(helper.monitorManager.messages[0].Fields.statusCode, 200);
    assert.equal(helper.monitorManager.messages[1].Fields.name, 'testParam');
    assert.equal(helper.monitorManager.messages[1].Fields.statusCode, 200);
    assert.equal(helper.monitorManager.messages[2].Fields.name, 'testSlashParam');
    assert.equal(helper.monitorManager.messages[2].Fields.statusCode, 404);
    assert.equal(helper.monitorManager.messages[3].Fields.name, 'testAnotherParam');
    assert.equal(helper.monitorManager.messages[3].Fields.statusCode, 500);
  });
});
