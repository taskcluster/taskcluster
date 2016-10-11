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
import slugid from 'slugid';
import sinon from 'sinon';

// Load configuration
let cfg = base.config({profile: 'test'});

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

// Setup before tests
mocha.before(async () => {
  base.testing.fakeauth.start(testClients);

  helper.validator = await base.validator({
    prefix: 'github/v1/',
    aws: cfg.aws,
  });

  // Fake scheduler createTaskGraph "implemementation"
  let scheduler = {
    createTaskGraph: (...rest) => {return {status: {taskGraphId: slugid.v4()}};},
  };

  // Stub out github operations that write and need higher permissions
  helper.stubs = {};
  let github = await load('github', {profile: 'test', process: 'test'});
  helper.stubs['comment'] = sinon.stub(github.repos, 'createCommitComment');

  webServer = await load('server', {profile: 'test', process: 'test'});
  helper.handlers = await load('handlers', {profile: 'test', process: 'test', scheduler, github});

  // Configure pulse receiver
  helper.events = new base.testing.PulseTestReceiver(cfg.pulse, mocha);
  let exchangeReference = exchanges.reference({
    exchangePrefix:   cfg.app.exchangePrefix,
    credentials:      cfg.pulse,
  });
  helper.TaskclusterGitHubEvents = taskcluster.createClient(exchangeReference);
  helper.taskclusterGithubEvents = new helper.TaskclusterGitHubEvents();

  // Configure pulse publisher
  helper.publisher = await load('publisher', {profile: 'test', process: 'test'});
});

// Cleanup after tests
mocha.after(async () => {
  // Kill webServer
  await webServer.terminate();
  await helper.handlers.terminate();
  base.testing.fakeauth.stop();
});
