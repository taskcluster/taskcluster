let mocha           = require('mocha');
let debug           = require('debug')('test:helper');
let load            = require('../src/main');
let config          = require('typed-env-config');
let testing         = require('taskcluster-lib-testing');
let urlencode       = require('urlencode');
let EventSource = require('eventsource');

const profile = 'test';
let loadOptions = {profile, process: 'test'};

// Create and export helper object
var helper = module.exports = {load, loadOptions};

// Load configuration
var cfg = config({profile});

// Configure PulseTestReceiver
helper.events = new testing.PulseTestReceiver(cfg.pulse, mocha);

var webServer = null;

// Setup before tests
mocha.before(async () => {
  // Create mock authentication server
  webServer = await load('server', loadOptions);
  debug('Server Setup');
});

helper.connect = bindings => {
  let json = urlencode(JSON.stringify(bindings));
  var es = new EventSource('http://localhost:12345/api/events/v1/connect/?bindings='+json);

  var pass, fail;
  var resolve = new Promise((resolve, reject) => {pass = resolve; fail= reject;});
  return {
    es:      es,
    resolve: resolve,
    pass:    pass,
    fail:    fail, 
  };
};
  
// Cleanup after tests
mocha.after(async () => {
  // Kill webServer
  await webServer.terminate();
  testing.fakeauth.stop();
});
