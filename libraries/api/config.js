"use strict";

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
 *   profile:      {},   // Profile configuration values (overrides defaults)
 *   envs:         [],   // Values to load from env, using `_` as separator
 *   filename:     null  // Filename to load config from at multiple levels
 * }
 *
 * Configuration values are searched in the following order:
 *  1. Environment variables
 *  2. Current working director (`./<filename>.conf.json`),
 *  3. Home folder (`~/.<filename>.conf.json`), and
 *  4. System config (`/etc/<filename>.conf.json`)
 *  5. Default value from `profile`
 *  6. Default value from `defaults`
 */
var config = function(options) {
  // Set default options
  options = _.defaults({}, options, {
    defaults:         {},
    profile:          {},
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
    cfg.file('local', {
      dir:    process.cwd(),
      file:   options.filename + '.conf.json',
      search: true
    });

    // User configuration
    cfg.file('user', {
      dir:    process.env.HOME,
      file:   '.' + options.filename + '.conf.json',
      search: true
    });

    // Global configuration
    cfg.file('global', {
      dir:    '/etc',
      file:   options.filename + '.conf.json',
      search: true
    });
  }

  // Load default values from profile
  cfg.overrides(options.profile);

  // Load defaults
  cfg.defaults(options.defaults);

  // Return configuration provider
  return cfg;
};

// Export config
module.exports = config;
