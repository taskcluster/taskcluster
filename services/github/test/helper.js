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
let fakeGithubAuth = require('./github-auth');
let FakePublisher = require('./publisher');

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

  let overwrites = {profile: 'test', process: 'test'};
  helper.load = async (component) => {
    if (component in overwrites) {
      return overwrites[component];
    }
    let loaded = overwrites[component] = await load(component, overwrites);
    return loaded;
  };

  // inject some fakes
  overwrites.github = fakeGithubAuth();
  helper.publisher = overwrites.publisher = new FakePublisher();

  helper.Builds = await helper.load('Builds', overwrites);
  helper.OwnersDirectory = await helper.load('OwnersDirectory', overwrites);
  helper.intree = overwrites.intree = await helper.load('intree', overwrites);
  webServer = overwrites.server = await helper.load('server', overwrites);

  helper.queue = new taskcluster.Queue({
    baseUrl: cfg.taskcluster.queueBaseUrl,
    credentials: cfg.taskcluster.credentials,
  });

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

mocha.beforeEach(async () => {
  let github = await helper.load('github');
  github.resetStubs();

  let publisher = await helper.load('publisher');
  publisher.resetStubs();
});

// Cleanup after all tests have completed
mocha.after(async () => {
  // Kill webServer
  if (webServer) {
    await webServer.terminate();
  }
  testing.fakeauth.stop();
});
