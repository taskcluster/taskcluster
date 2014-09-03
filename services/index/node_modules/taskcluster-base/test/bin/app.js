var base  = require('../../');
var debug = require('debug')('base:test:bin:app.js');

/** Global State where we count requests */
var global_state = 0;

/** Launch a simple test app */
var launch = function() {
  // Create a simple app we can use for testing
  var app = base.app({
    port:         Number(process.argv[2]) || 62827,
      env:        'development',
      forceSSL:   false,
      trustProxy: false
  });

  // Respond 'Hello World' for /test
  app.get('/test', function(req, res) {
    res.status(200).send("Hello World");
  });

  // Respond request count in process for /request-count
  app.get('/request-count', function(req, res) {
    global_state += 1;
    res.status(200).send("Count: " + global_state);
  });

  // Kill process in crash case for testing
  if (process.argv[2] === 'CRASH') {
    setTimeout(function() {
      process.exit(1);
    }, 1000);
  }

  // Create a server
  return app.createServer();
};

// If is executed run launch
if (!module.parent) {
  launch().then(function() {
    debug("Launched app.js successfully");
  }).catch(function(err) {
    debug("Failed to start app.js, err: %s, as JSON: %j", err, err, err.stack);
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;