import assert from 'assert';
import http from 'http';
import Promise from 'promise';
import path from 'path';
import fs from 'fs';
import _ from 'lodash';
import base from 'taskcluster-base';
import api from '../lib/api';
import taskcluster from 'taskcluster-client';
import mocha from 'mocha';
import exchanges from '../lib/exchanges';
import load from '../lib/main';

// Load configuration
let cfg = base.config({profile: 'test'});

let testClients = {
  'test-server': ['*'],
  'test-client': ['*'],
};

// Create and export helper object
let helper = module.exports = {};

// Turn integration tests on or off depending on pulse credentials being set
helper.canRunIntegrationTests = true;
let mockPublisher = false;
if (!cfg.pulse.password) {
  helper.canRunIntegrationTests = false;
  mockPublisher = true;
  console.log('No pulse credentials: integration tests will be skipped.');
}

// Build an http request from a json file with fields describing
// headers and a body
helper.jsonHttpRequest = function (jsonFile, options) {
  let defaultOptions = {
    hostname: 'localhost',
    port: cfg.server.port,
    path: '/v1/github',
    method: 'POST',
  };

  options = _.defaultsDeep(options, defaultOptions);

  let jsonData = JSON.parse(fs.readFileSync(jsonFile));
  options.headers = jsonData.headers;
  return new Promise (function (accept, reject) {
    try {
      let req = http.request(options, accept);
      req.write(JSON.stringify(jsonData.body));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
};

// Hold reference to authServer
let authServer = null;
let webServer = null;

// Setup before tests
mocha.before(async () => {
  base.testing.fakeauth.start(testClients);

  helper.validator = await base.validator({
    prefix: 'github/v1/',
    aws: cfg.aws,
  });

  webServer = await load('server', {profile: 'test', process: 'test', mockPublisher});

  if (helper.canRunIntegrationTests) {
    // Configure PulseTestReceiver
    helper.events = new base.testing.PulseTestReceiver(cfg.pulse, mocha);
    // Create client for binding to reference
    let exchangeReference = exchanges.reference({
      exchangePrefix:   cfg.taskclusterGithub.exchangePrefix,
      credentials:      cfg.pulse,
    });
    helper.TaskclusterGitHubEvents = taskcluster.createClient(exchangeReference);
    helper.taskclusterGithubEvents = new helper.TaskclusterGitHubEvents();
  }
});

// Cleanup after tests
mocha.after(async () => {
  // Kill webServer
  await webServer.terminate();
  base.testing.fakeauth.stop();
});
