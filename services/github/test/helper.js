import http from 'http';
import fs from 'fs';
import _ from 'lodash';
import sinon from 'sinon';
import builder from '../src/api';
import taskcluster from 'taskcluster-client';
import load from '../src/main';
import fakeGithubAuth from './github-auth.js';

import {
  fakeauth,
  stickyLoader,
  Secrets,
  withPulse,
  withMonitor,
  withDb,
  resetTables,
} from 'taskcluster-lib-testing';

export const load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

withMonitor(exports);

// set up the testing secrets
export const secrets = new Secrets({
  secrets: {
  },
  load: exports.load,
});

// Build an http request from a json file with fields describing
// headers and a body
export const jsonHttpRequest = function(jsonFile, options) {
  let defaultOptions = {
    hostname: 'localhost',
    port: 60415,
    path: '/api/github/v1/github',
    method: 'POST',
  };
  options = _.defaultsDeep(options, defaultOptions);
  let jsonData = JSON.parse(fs.readFileSync(jsonFile));
  options.headers = jsonData.headers;

  return new Promise(function(accept, reject) {
    try {
      let req = http.request(options, accept);
      req.write(JSON.stringify(jsonData.body));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
};

export const withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'github');
};

export const withPulse = (mock, skipping) => {
  withPulse({ helper: exports, skipping, namespace: 'taskcluster-github' });
};

/**
 * Set the `github` loader component to a fake version.
 * This is reset before each test.  Call this before withServer.
 */
export const withFakeGithub = (mock, skipping) => {
  suiteSetup(function() {
    exports.load.inject('github', fakeGithubAuth());
  });

  suiteTeardown(function() {
    exports.load.remove('github');
  });

  setup(async function() {
    let fakeGithub = await load('github');
    fakeGithub.resetStubs();
  });
};

/**
 * Set the `queueClient` loader component to a fake version.
 */
export const withFakeQueue = (mock, skipping) => {
  const fakeQueueClient = () => new taskcluster.Queue({
    rootUrl: 'https://tc.example.com',
    fake: {
      sealTaskGroup: sinon.stub(),
      cancelTaskGroup: sinon.stub(),
    },
  });

  suiteSetup(function() {
    exports.load.inject('queueClient', fakeQueueClient());
  });

  suiteTeardown(function() {
    exports.load.remove('queueClient');
  });
};

/**
 * Set up an API server.  Call this after withDb, so the server
 * uses the same entities classes.
 *
 * This also sets up helper.apiClient as a client of the service API.
 */
export const withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    await load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    export const rootUrl = 'http://localhost:60415';

    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);
    exports.load.cfg('taskcluster.clientId', null);
    exports.load.cfg('taskcluster.accessToken', null);

    fakeauth.start({
      'test-client': ['*'],
    }, { rootUrl: exports.rootUrl });

    export const GithubClient = taskcluster.createClient(builder.reference());

    export const apiClient = new exports.GithubClient({
      credentials: { clientId: 'test-client', accessToken: 'unused' },
      rootUrl: exports.rootUrl,
      retries: 0,
    });

    webServer = await load('server');
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
    fakeauth.stop();
  });
};

export const resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await resetTables({ tableNames: [
      'github_builds',
      'github_checks',
      'github_integrations',
    ] });
  });
};
