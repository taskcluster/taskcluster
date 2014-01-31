var fs      = require('fs');
var nconf   = require('nconf');

/** Default configuration values */
var DEFAULT_CONFIG_VALUES = {
  // Server (HTTP) configuration
  'server': {
    // Server hostname
    'hostname':                     'localhost',

    // Port to run the HTTP server on
    'port':                         3000,

    // Cookie secret used to sign cookies, must be secret at deployment
    'cookie-secret':                "Warn, if no secret is used on production"
  },

  // Database configuration
  'database': {
    // Database hostname
    'host':                         'localhost',

    // Database port
    'port':                         1234,

    // Database name
    'name':                         'queue-v1',

    // Database user
    'user':                         'queue',

    // Database password
    'password':                     '42'
  }
};

/** Load configuration */
exports.load = function(default_only) {

  if (!default_only || true) {
    // Load configuration from command line arguments, if requested
    nconf.argv();

    // Config from current working folder if present
    nconf.file('local', 'taskcluster-queue.conf.json');

    // User configuration
    nconf.file('user', '~/.taskcluster-queue.conf.json');

    // Global configuration
    nconf.file('global', '/etc/taskcluster-queue.conf.json');
  }

  // Load default configuration
  nconf.defaults(DEFAULT_CONFIG_VALUES);
}
