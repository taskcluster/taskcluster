const request         = require('superagent');
const assert          = require('assert');
const Promise         = require('promise');
const APIBuilder      = require('../');
const monitoring      = require('taskcluster-lib-monitor');
const helper          = require('./helper');
const libUrls         = require('taskcluster-lib-urls');

suite('api/responsetimer', function() {
  // Create test api
  var builder = new APIBuilder({
    title:        'Test Api',
    description:  'Another test api',
    serviceName:  'test',
    version:      'v1',
  });

  builder.declare({
    method:   'get',
    route:    '/single-param/:myparam',
    name:     'testParam',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send(req.params.myparam);
  });

  builder.declare({
    method:   'get',
    route:    '/slash-param/:name(*)',
    name:     'testSlashParam',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(404).send(req.params.name);
  });

  builder.declare({
    method:   'get',
    route:    '/another-param/:name(*)',
    name:     'testAnotherParam',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(500).send(req.params.name);
  });

  // Reference for test api server
  var _apiServer = null;

  var monitor = null;

  // Create a mock authentication server
  setup(async () => {
    monitor = await monitoring({
      projectName: 'tc-lib-api-test',
      credentials: {clientId: 'fake', accessToken: 'fake'},
      mock: true,
    });

    await helper.setupServer({builder, monitor: monitor.prefix('api')});
  });
  teardown(helper.teardownServer);

  test('single parameter', function() {
    const u = path => libUrls.api(helper.rootUrl, 'test', 'v1', path);
    return Promise.all([
      request.get(u('/single-param/Hello')),
      request.get(u('/single-param/Goodbye')),
      request.get(u('/slash-param/Slash')).catch(err => {}),
      request.get(u('/another-param/Another')).catch(err => {}),
    ]).then(function() {
      assert.equal(Object.keys(monitor.counts).length, 9);
      assert.equal(monitor.counts['tc-lib-api-test.api.testParam.success'], 2);
      assert.equal(monitor.counts['tc-lib-api-test.api.testParam.all'], 2);
      assert.equal(monitor.counts['tc-lib-api-test.api.testSlashParam.client-error'], 1);
      assert.equal(monitor.counts['tc-lib-api-test.api.testSlashParam.all'], 1);
      assert.equal(monitor.counts['tc-lib-api-test.api.testAnotherParam.server-error'], 1);
      assert.equal(monitor.counts['tc-lib-api-test.api.testAnotherParam.all'], 1);
      assert.equal(monitor.counts['tc-lib-api-test.api.all,success'], 2);
      assert.equal(monitor.counts['tc-lib-api-test.api.all,server-error'], 1);
      assert.equal(monitor.counts['tc-lib-api-test.api.all,client-error'], 1);

      assert.equal(Object.keys(monitor.measures).length, 9);
      assert.equal(monitor.measures['tc-lib-api-test.api.testParam.success'].length, 2);
      assert.equal(monitor.measures['tc-lib-api-test.api.testParam.all'].length, 2);
      assert.equal(monitor.measures['tc-lib-api-test.api.testSlashParam.client-error'].length, 1);
      assert.equal(monitor.measures['tc-lib-api-test.api.testSlashParam.all'].length, 1);
      assert.equal(monitor.measures['tc-lib-api-test.api.testAnotherParam.server-error'].length, 1);
      assert.equal(monitor.measures['tc-lib-api-test.api.testAnotherParam.all'].length, 1);
      assert.equal(monitor.measures['tc-lib-api-test.api.all,success'].length, 2);
      assert.equal(monitor.measures['tc-lib-api-test.api.all,server-error'].length, 1);
      assert.equal(monitor.measures['tc-lib-api-test.api.all,client-error'].length, 1);
    });
  });
});
