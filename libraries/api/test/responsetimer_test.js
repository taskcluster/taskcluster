suite("api/responsetimer", function() {
  require('superagent-hawk')(require('superagent'));
  var request         = require('superagent-promise');
  var assert          = require('assert');
  var Promise         = require('promise');
  var subject         = require('../');
  var monitoring      = require('taskcluster-lib-monitor');
  var helper          = require('./helper');

  // Create test api
  var api = new subject({
    title:        "Test Api",
    description:  "Another test api"
  });

  api.declare({
    method:   'get',
    route:    '/single-param/:myparam',
    name:     'testParam',
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.status(200).send(req.params.myparam);
  });

  api.declare({
    method:   'get',
    route:    '/slash-param/:name(*)',
    name:     'testSlashParam',
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.status(404).send(req.params.name);
  });

  api.declare({
    method:   'get',
    route:    '/another-param/:name(*)',
    name:     'testAnotherParam',
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.status(500).send(req.params.name);
  });

  // Reference for test api server
  var _apiServer = null;

  var monitor = null;

  // Create a mock authentication server
  setup(async () => {
    monitor = await monitoring({
      project: 'tc-lib-api-test',
      credentials: {clientId: 'fake', accessToken: 'fake'},
      mock: true,
    });

    await helper.setupServer({api, monitor: monitor.prefix('api')});
  });
  teardown(helper.teardownServer);

  test("single parameter", function() {
    return Promise.all([
        request.get('http://localhost:23525/single-param/Hello').end(),
        request.get('http://localhost:23525/single-param/Goodbye').end(),
        request.get('http://localhost:23525/slash-param/Slash').end(),
        request.get('http://localhost:23525/another-param/Another').end(),
      ]).then(function() {
        assert.equal(Object.keys(monitor.counts).length, 6);
        assert.equal(monitor.counts['tc-lib-api-test.api.testParam.success'], 2);
        assert.equal(monitor.counts['tc-lib-api-test.api.testParam.all'], 2);
        assert.equal(monitor.counts['tc-lib-api-test.api.testSlashParam.client-error'], 1);
        assert.equal(monitor.counts['tc-lib-api-test.api.testSlashParam.all'], 1);
        assert.equal(monitor.counts['tc-lib-api-test.api.testAnotherParam.server-error'], 1);
        assert.equal(monitor.counts['tc-lib-api-test.api.testAnotherParam.all'], 1);

        assert.equal(Object.keys(monitor.measures).length, 6);
        assert.equal(monitor.measures['tc-lib-api-test.api.testParam.success'].length, 2);
        assert.equal(monitor.measures['tc-lib-api-test.api.testParam.all'].length, 2);
        assert.equal(monitor.measures['tc-lib-api-test.api.testSlashParam.client-error'].length, 1);
        assert.equal(monitor.measures['tc-lib-api-test.api.testSlashParam.all'].length, 1);
        assert.equal(monitor.measures['tc-lib-api-test.api.testAnotherParam.server-error'].length, 1);
        assert.equal(monitor.measures['tc-lib-api-test.api.testAnotherParam.all'].length, 1);
      });
  });
});
