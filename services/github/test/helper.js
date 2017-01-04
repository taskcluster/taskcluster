let assert = require('assert');
let http = require('http');
let Promise = require('promise');
let path = require('path');
let fs = require('fs');
let _ = require('lodash');
let api = require('../lib/api');
let Intree = require('../lib/intree');
let taskcluster = require('taskcluster-client');
let mocha = require('mocha');
let exchanges = require('../lib/exchanges');
let load = require('../lib/main');
let slugid = require('slugid');
let config = require('typed-env-config');
let testing = require('taskcluster-lib-testing');
let validator = require('taskcluster-lib-validate');

// Load configuration
let cfg = config({profile: 'test'});

let testClients = {
  'test-server': ['*'],
  'test-client': ['*'],
};

// Create and export helper object
let helper = module.exports = {};

// Build an http request from a json file with fields describing
// headers and a body
helper.jsonHttpRequest = function(jsonFile, options) {
  let defaultOptions = {
    hostname: 'localhost',
    port: cfg.server.port,
    path: '/v1/github',
    method: 'POST',
  };

  options = _.defaultsDeep(options, defaultOptions);

  let jsonData = JSON.parse(fs.readFileSync(jsonFile));
  options.headers = jsonData.headers;
  return new Promise (function(accept, reject) {
    try {
      let req = http.request(options, accept);
      req.write(JSON.stringify(jsonData.body));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
};

let webServer = null;

// Setup before any tests run (note that even with TDD style, `mocha.setup` does nothing)
mocha.before(async () => {
  testing.fakeauth.start(testClients);

  helper.validator = await validator({
    prefix: 'github/v1/',
    aws: cfg.aws,
  });

  webServer = await load('server', {profile: 'test', process: 'test'});

  helper.intree = await load('intree', {profile: 'test', process: 'test'});
  helper.Builds = await load('Builds', {profile: 'test', process: 'test'});

  helper.queue = new taskcluster.Queue({
    baseUrl: cfg.taskcluster.queueBaseUrl,
    credentials: cfg.taskcluster.credentials,
  });

  // Configure pulse receiver
  helper.events = new testing.PulseTestReceiver(cfg.pulse, mocha);
  let exchangeReference = exchanges.reference({
    exchangePrefix:   cfg.app.exchangePrefix,
    credentials:      cfg.pulse,
  });
  helper.TaskclusterGitHubEvents = taskcluster.createClient(exchangeReference);
  helper.taskclusterGithubEvents = new helper.TaskclusterGitHubEvents();

  // Configure pulse publisher
  helper.publisher = await load('publisher', {profile: 'test', process: 'test'});

  helper.baseUrl = 'http://localhost:' + webServer.address().port + '/v1';
  let reference = api.reference({baseUrl: helper.baseUrl});
  helper.Github = taskcluster.createClient(reference);
  helper.github = new helper.Github({
    baseUrl: helper.baseUrl,
    credentials: {
      clientId: 'test-client',
      accessToken: 'none',
    },
  });
});

// Cleanup after all tests have completed
mocha.after(async () => {
  // Kill webServer
  if (webServer) {
    await webServer.terminate();
  }
  testing.fakeauth.stop();
});
