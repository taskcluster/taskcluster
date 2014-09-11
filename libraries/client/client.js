/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Load superagent-hawk
require('superagent-hawk')(require('superagent'));

var request     = require('superagent-promise');
var debug       = require('debug')('taskcluster-client');
var _           = require('lodash');
var assert      = require('assert');
var hawk        = require('hawk');
var url         = require('url');
var crypto      = require('crypto');
var slugid      = require('slugid');

// Default options stored globally for convenience
var _defaultOptions = {
  credentials: {
    clientId:     process.env.TASKCLUSTER_CLIENT_ID,
    accessToken:  process.env.TASKCLUSTER_ACCESS_TOKEN,
    certificate:  process.env.TASKCLUSTER_CERTIFICATE
  },

  authorization: {
    delegating: false,
    scopes: []
  }
};

/**
 * Create a client class from a JSON reference.
 *
 * Returns a Client class which can be initialized with following options:
 * options:
 * {
 *   // TaskCluster credentials, if not provided fallback to defaults from
 *   // environment variables, if defaults are not explicitly set with
 *   // taskcluster.config({...}).
 *   // To create a client without authentication (and not using defaults)
 *   // use `credentials: {}`
 *   credentials: {
 *     clientId:    '...', // ClientId
 *     accessToken: '...', // AccessToken for clientId
 *   },
 *   // Limit the set of scopes requests with this client may make.
 *   // Note, that your clientId must have a superset of the these scopes.
 *   authorizedScopes:  ['scope1', 'scope2', ...]
 *   baseUrl:         'http://.../v1'   // baseUrl for API requests
 *   exchangePrefix:  'queue/v1/'       // exchangePrefix prefix
 * }
 *
 * `baseUrl` and `exchangePrefix` defaults to values from reference.
 */
exports.createClient = function(reference) {
  // Client class constructor
  var Client = function(options) {
    this._options = _.defaults({}, options || {}, {
      baseUrl:          reference.baseUrl        || '',
      exchangePrefix:   reference.exchangePrefix || ''
    }, _defaultOptions);

    // Parse certificate if provided and parsing is necessary
    if (this._options.credentials && this._options.credentials.certificate) {
      this._options.certificate = this._options.credentials.certificate;
      if (typeof(this._options.certificate) === 'string') {
        this._options.certificate = JSON.parse(this._options.certificate);
      }
    }
  };

  // For each function entry create a method on the Client class
  reference.entries.filter(function(entry) {
    return entry.type === 'function';
  }).forEach(function(entry) {
    // Get number of arguments
    var nb_args = entry.args.length;
    if (entry.input) {
      nb_args += 1;
    }

    // Create method on prototype
    Client.prototype[entry.name] = function() {
      debug("Calling: " + entry.name);
      // Convert arguments to actual array
      var args = Array.prototype.slice.call(arguments);
      // Validate number of arguments
      if (args.length != nb_args) {
        throw new Error("Function " + entry.name + " takes " + nb_args +
                        "arguments, but was given " + args.length +
                        " arguments");
      }
      // Substitute parameters into route
      var endpoint = entry.route;
      entry.args.forEach(function(arg) {
        var value = args.shift();
        // Replace with empty string in case of undefined or null argument
        if (value === undefined || value === null) {
          value = '';
        }
        endpoint = endpoint.replace('<' + arg + '>', value);
      });
      // Create request
      var req = request[entry.method](this._options.baseUrl + endpoint);
      // Add payload if one is given
      if (entry.input) {
        req.send(args.pop());
      }
      // Authenticate, if credentials are provided
      if (this._options.credentials &&
          this._options.credentials.clientId &&
          this._options.credentials.accessToken) {
        // Construct ext property
        var ext = {};

        // If there is a certificate we have temporary credentials, and we
        // must provide the certificate
        if (this._options.certificate) {
          ext.certificate = this._options.certificate;
        }

        // If set of authorized scopes is provided, we'll restrict the request
        // to only use these scopes
        if (this._options.authorizedScopes instanceof Array) {
          ext.authorizedScopes = this._options.authorizedScopes;
        }

        // Extra paramters to hand hawk
        var extra = {};

        // ext has any keys we better base64 encode it, and set ext on extra
        if (_.keys(ext).length > 0) {
          extra.ext = new Buffer(JSON.stringify(ext)).toString('base64');
        }

        // Write hawk authentication header
        req.hawk({
          id:         this._options.credentials.clientId,
          key:        this._options.credentials.accessToken,
          algorithm:  'sha256'
        }, extra);
      }
      // Send request and handle response
      return req.end().then(function(res) {
        if (!res.ok) {
          debug("Error calling: %s, info: %j", entry.name, res.body);
          var message = "Unknown Server Error";
          if (res.status === 401) {
            message = "Authentication Error";
          }
          if (res.status === 500) {
            message = "Internal Server Error";
          }
          err = new Error(res.body.message || message);
          err.body = res.body;
          err.statusCode = res.status;
          throw err
        }
        debug("Success calling: " + entry.name);
        return res.body;
      });
    };
    // Add reference for buildUrl and signUrl
    Client.prototype[entry.name].entryReference = entry;
  });

  // For each topic-exchange entry
  reference.entries.filter(function(entry) {
    return entry.type === 'topic-exchange';
  }).forEach(function(entry) {
    // Create function for routing-key pattern construction
    Client.prototype[entry.name] = function(routingKeyPattern) {
      if (typeof(routingKeyPattern) !== 'string') {
        // Allow for empty routing key patterns
        if (routingKeyPattern === undefined ||
            routingKeyPattern === null) {
          routingKeyPattern = {};
        }
        // Check that the routing key pattern is an object
        assert(routingKeyPattern instanceof Object,
               "routingKeyPattern must be an object");

        // Construct routingkey pattern as string from reference
        routingKeyPattern = entry.routingKey.map(function(key) {
          // Get value for key
          var value = routingKeyPattern[key.name];
          // Routing key constant entries cannot be modified
          if (key.constant) {
            value =  key.constant;
          }
          // If number convert to string
          if (typeof(value) === 'number') {
            return '' + value;
          }
          // Validate string and return
          if (typeof(value) === 'string') {
            // Check for multiple words
            assert(key.multipleWords || value.indexOf('.') === -1,
                   "routingKey pattern '" + value + "' for " + key.name +
                   " cannot contain dots as it does not hold multiple words");
            return value;
          }
          // Check that we haven't got an invalid value
          assert(value === null || value === undefined,
                "Value: '" + value + "' is not supported as routingKey "+
                "pattern for " + key.name);
          // Return default pattern for entry not being matched
          return key.multipleWords ? '#' : '*';
        }).join('.');
      }

      // Return values necessary to bind with EventHandler
      return {
        exchange:             this._options.exchangePrefix + entry.exchange,
        routingKeyPattern:    routingKeyPattern,
        routingKeyReference:  _.cloneDeep(entry.routingKey)
      };
    };
  });

  // Utility function to build the request URL for given method and
  // input parameters
  Client.prototype.buildUrl = function() {
      // Convert arguments to actual array
      var args = Array.prototype.slice.call(arguments);
      if (args.length == 0) {
        throw new Error("buildUrl(method, arg1, arg2, ...) takes a least one " +
                        "argument!");
      }
      // Find the method
      var method = args.shift();
      var entry  = method.entryReference;
      if (!entry || entry.type !== 'function') {
        throw new Error("method in buildUrl(method, arg1, arg2, ...) must be " +
                        "an API method from the same object!");
      }

      debug("build url for: " + entry.name);
      // Validate number of arguments
      if (args.length != entry.args.length) {
        throw new Error("Function " + entry.name + "buildUrl() takes " +
                        (entry.args.length + 1) + " arguments, but was given " +
                        (args.length + 1) + " arguments");
      }
      // Substitute parameters into route
      var endpoint = entry.route;
      entry.args.forEach(function(arg) {
        var value = args.shift();
        // Replace with empty string in case of undefined or null argument
        if (value === undefined || value === null) {
          value = '';
        }
        endpoint = endpoint.replace('<' + arg + '>', value);
      });

      return this._options.baseUrl + endpoint;
    };

    // Utility function to construct a bewit URL for GET requests
    Client.prototype.buildSignedUrl = function() {
      // Convert arguments to actual array
      var args = Array.prototype.slice.call(arguments);
      if (args.length == 0) {
        throw new Error("buildSignedUrl(method, arg1, arg2, ..., [options]) " +
                        "takes a least one argument!");
      }

      // Find method and reference entry
      var method = args[0];
      var entry  = method.entryReference;
      if (entry.method !== 'get') {
        throw new Error("buildSignedUrl only works for GET requests");
      }

      // Default to 15 minutes before expiration
      var expiration = 15 * 60;

      // if longer than method + args, then we have options too
      if (args.length > entry.args.length + 1) {
        // Get request options
        var options = args.pop();

        // Get expiration from options
        expiration = options.expiration || expiration;

        // Complain if expiration isn't a number
        if (typeof(expiration) !== 'number') {
          throw new Error("options.expiration must be a number");
        }
      }

      // Build URL
      var requestUrl = this.buildUrl.apply(this, args);

      // Check that we have credentials
      if (!this._options.credentials.clientId) {
        throw new Error("credentials must be given");
      }
      if (!this._options.credentials.accessToken) {
        throw new Error("accessToken must be given");
      }

      // Generate meta-data to include
      var ext = undefined;
      // If set of authorized scopes is provided, we'll restrict the request
      // to only use these scopes
      if (this._options.authorizedScopes instanceof Array) {
        ext = new Buffer(JSON.stringify({
          authorizedScopes: this._options.authorizedScopes
        })).toString('base64');
      }

      // Create bewit
      var bewit = hawk.uri.getBewit(requestUrl, {
        credentials:    {
          id:         this._options.credentials.clientId,
          key:        this._options.credentials.accessToken,
          algorithm:  'sha256'
        },
        ttlSec:         expiration,
        ext:            ext
      });

      // Add bewit to requestUrl
      var urlParts = url.parse(requestUrl);
      if (urlParts.search) {
        urlParts.search += "&bewit=" + bewit;
      } else {
        urlParts.search = "?bewit=" + bewit;
      }

      // Return formatted URL
      return url.format(urlParts);
    };

  // Return client class
  return Client;
};


// Load data from apis.js
var apis = require('./apis');

// Instantiate clients
_.forIn(apis, function(api, name) {
  exports[name] = exports.createClient(api.reference);
});

/**
 * Update default configuration
 *
 * Example: `Client.config({credentials: {...}});`
 */
exports.config = function(options) {
  _defaultOptions = _.defaults({}, options, _defaultOptions);
};

/**
 * Construct a set of temporary credentials.
 *
 * options:
 * {
 *  start:        new Date(),   // Start time of credentials (defaults to now)
 *  expiry:       new Date(),   // Credentials expiration time
 *  scopes:       ['scope'...], // Scopes granted (defaults to empty-set)
 *  credentials: {        // (defaults to use global config, if available)
 *    clientId:    '...', // ClientId
 *    accessToken: '...', // AccessToken for clientId
 *  },
 * }
 *
 * Returns an object on the form: {clientId, accessToken, certificate}
 */
exports.createTemporaryCredentials = function(options) {
  assert(options, "options are required");

  // Get now as default value for start
  var now = new Date();
  now.setMinutes(now.getMinutes() - 5); // subtract 5 min for clock drift

  // Set default options
  options = _.defaults({}, options, {
    start:      now,
    scopes:     []
  }, _defaultOptions);

  // Validate options
  assert(options.credentials,             "options.credentials is required");
  assert(options.credentials.clientId,
         "options.credentials.clientId is required");
  assert(options.credentials.accessToken,
         "options.credentials.accessToken is required");
  assert(options.credentials.certificate === undefined ||
         options.credentials.certificate === null,
         "temporary credentials cannot be used to make new temporary " +
         "credentials; ensure that options.credentials.certificate is null");
  assert(options.start instanceof Date,   "options.start must be a Date");
  assert(options.expiry instanceof Date,  "options.expiry must be a Date");
  assert(options.scopes instanceof Array, "options.scopes must be an array");
  options.scopes.forEach(function(scope) {
    assert(typeof(scope) === 'string',
           "options.scopes must be an array of strings");
  });
  assert(options.expiry.getTime() - options.start.getTime() <=
         31 * 24 * 60 * 60 * 1000, "Credentials can span more than 31 days");

  // Construct certificate
  var cert = {
    version:    1,
    scopes:     _.cloneDeep(options.scopes),
    start:      options.start.getTime(),
    expiry:     options.expiry.getTime(),
    seed:       slugid.v4() + slugid.v4(),
    signature:  null  // generated later
  };

  // Construct signature
  cert.signature = crypto
    .createHmac('sha256', options.credentials.accessToken)
    .update(
      [
        'version:'  + cert.version,
        'seed:'     + cert.seed,
        'start:'    + cert.start,
        'expiry:'   + cert.expiry,
        'scopes:'
      ].concat(cert.scopes).join('\n')
    )
    .digest('base64');

  // Construct temporary key
  var accessToken = crypto
    .createHmac('sha256', options.credentials.accessToken)
    .update(cert.seed)
    .digest('base64')
    .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
    .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
    .replace(/=/g,  '');  // Drop '==' padding

  // Return the generated temporary credentials
  return {
    clientId:     options.credentials.clientId,
    accessToken:  accessToken,
    certificate:  JSON.stringify(cert)
  };
};
