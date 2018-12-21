var assert      = require('assert');
var _           = require('lodash');
var nconf       = require('nconf');

/**
 * Load and return a configuration object (nconf, not global)
 * Access properties using `config.get('object:key')`.
 *
 * options:
 * {
 *   defaults:     {},   // Default configuration values
 *   envs:         [],   // Values to load from env, using `_` as separator
 *   filename:     null  // Filename to load config from at multiple levels
 * }
 *
 * If `filename` is given, configuration will be loaded from folders in the
 * following order:
 *
 *  1. Current working director (`./<filename>.conf.json`),
 *  2. Home folder (`~/.<filename>.conf.json`), and
 *  3. System config (`/etc/<filename>.conf.json`)
 *
 */
var config = function(options) {
  // Set default options
  _.defaults(options, {
    defaults:         {},
    envs:             [],
    filename:         null
  });
  assert(options.envs instanceof Array, "'envs' must be an array");

  // Create config provider
  var cfg = new nconf.Provider();

  // Load whitelisted configuration keys from environment variables
  if (options.envs.length > 0) {
    cfg.env({
      separator:  '_',
      whitelist:  options.envs
    });
  }

  // Load configuration from file
  if (options.filename) {
    // Config from current working folder if present
    cfg.file('local', options.filename + '.conf.json');

    // User configuration
    cfg.file('user', '~/.' + options.filename + '.conf.json');

    // Global configuration
    cfg.file('global', '/etc/' + options.filename + '.conf.json');
  }

  // Load defaults
  cfg.defaults(options.defaults);

  // Return configuration provider
  return cfg;
};

// Export config
module.exports = config;