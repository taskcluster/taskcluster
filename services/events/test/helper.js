const mocha           = require('mocha');
const debug           = require('debug')('test:helper');
const load            = require('../src/main');
const urlencode       = require('urlencode');
const EventSource     = require('eventsource');
const libUrls = require('taskcluster-lib-urls');
const {stickyLoader, Secrets} = require('taskcluster-lib-testing');

// Create and export helper object
const helper = module.exports;

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

exports.secrets = new Secrets({
  secretName: 'projects/taskcluster/testing/taskcluster-events',
  secrets: {
    taskcluster: [
      {env: 'TASKCLUSTER_ROOT_URL', cfg: 'taskcluster.rootUrl', name: 'rootUrl',
        mock: libUrls.testRootUrl()},
    ],
  },
  load: exports.load,
});

helper.rootUrl = 'http://localhost:12345';

/**
* Create the Listeners component with fake Pulselistener(s)
* and add that to helper.listeners .
*/
exports.withPulse = (mock, skipping) => {
  let Listener;
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    helper.load.cfg('pulse.fake', true);
    Listener = await helper.load('listeners');
    helper.listeners = Listener.listeners;
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (Listener) {
      await Listener.terminate();
      Listener = null;
    }
  });
};

/**
 * Set up an API server.  Call this after withPulse, so the server
 * uses fake listeners used to send fake messages.
 */
exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    const cfg = await exports.load('cfg');
    exports.load.cfg('taskcluster.rootUrl', helper.rootUrl);

    helper.connect = bindings => {
      const jsonBindings = urlencode(JSON.stringify(bindings));
      debug('Connecting to api...');
      const evtSource = new EventSource(libUrls.api(
        helper.rootUrl,
        'events',
        'v1',
        `/connect/?bindings=${jsonBindings}`
      ));
      let pass, fail;
      const resolve = new Promise((resolve, reject) => {
        pass = resolve;
        fail = reject;
      });
      return {
        evtSource,
        resolve,
        pass,
        fail, 
      };
    };

    webServer = await helper.load('server');
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
  });
};
