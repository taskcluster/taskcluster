/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Load superagent-hawk
var superagent  = require('superagent-hawk')(require('superagent'));

var request     = require('superagent-promise').wrap(superagent);
var debug       = require('debug')('taskcluster-client');
var _           = require('lodash');
var assert      = require('assert');
var hawk        = require('hawk');
var url         = require('url');
var crypto      = require('crypto');
var slugid      = require('slugid');
var Promise     = require('promise');

// Default options stored globally for convenience
var _defaultOptions = {
  credentials: {
    clientId:     process.env.TASKCLUSTER_CLIENT_ID,
    accessToken:  process.env.TASKCLUSTER_ACCESS_TOKEN,
    certificate:  process.env.TASKCLUSTER_CERTIFICATE
  },

  maxRetries:     5
};


/** Make a request for a Client instance */
var makeRequest = function(client, method, url, payload) {
  // Construct request object
  var req = request(method.toUpperCase(), url);

  // Send payload if defined
  if (payload !== undefined) {
    req.send(payload);
  }

  // Authenticate, if credentials are provided
  if (client._options.credentials &&
      client._options.credentials.clientId &&
      client._options.credentials.accessToken) {
    // Write hawk authentication header
    req.hawk({
      id:         client._options.credentials.clientId,
      key:        client._options.credentials.accessToken,
      algorithm:  'sha256'
    }, {
      ext:        client._extData
    });
  }

  // Return request
  return req;
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
 *     certificate: {...}  // Certificate, if temporary credentials
 *   },
 *   // Limit the set of scopes requests with this client may make.
 *   // Note, that your clientId must have a superset of the these scopes.
 *   authorizedScopes:  ['scope1', 'scope2', ...]
 *   baseUrl:         'http://.../v1'   // baseUrl for API requests
 *   exchangePrefix:  'queue/v1/'       // exchangePrefix prefix
 *   maxRetries:      5,                // Maximum number of attempts
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

    // Build ext for hawk requests
    this._extData = undefined;
    if (this._options.credentials &&
        this._options.credentials.clientId &&
        this._options.credentials.accessToken) {
      var ext = {};

      // If there is a certificate we have temporary credentials, and we
      // must provide the certificate
      if (this._options.credentials.certificate) {
        ext.certificate = this._options.credentials.certificate;
        // Parse as JSON if it's a string
        if (typeof(ext.certificate) === 'string') {
          try {
            ext.certificate = JSON.parse(ext.certificate);
          }
          catch(err) {
            debug("Failed to parse credentials.certificate, err: %s, JSON: %j",
                  err, err);
            throw new Error("JSON.parse(): Failed for configured certificate");
          }
        }
      }

      // If set of authorized scopes is provided, we'll restrict the request
      // to only use these scopes
      if (this._options.authorizedScopes instanceof Array) {
        ext.authorizedScopes = this._options.authorizedScopes;
      }

      // ext has any keys we better base64 encode it, and set ext on extra
      if (_.keys(ext).length > 0) {
        this._extData = new Buffer(JSON.stringify(ext)).toString('base64');
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
      // Convert arguments to actual array
      var args = Array.prototype.slice.call(arguments);
      // Validate number of arguments
      if (args.length != nb_args) {
        throw new Error("Function " + entry.name + " takes " + nb_args +
                        " arguments, but was given " + args.length +
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
      // Create url for the request
      var url = this._options.baseUrl + endpoint;
      // Add payload if one is given
      var payload = undefined;
      if (entry.input) {
        payload = args.pop();
      }

      // Count request attempts
      var attempts = 0;
      var that = this;

      // Return promise that we've used all retries
      return new Promise(function(accept, reject) {
        // Retry the request, after a delay depending on number of retries
        var retryRequest = function() {
          // Send request
          var sendRequest = function() {
            debug("Calling: %s, retry: %s", entry.name, attempts - 1);
            // Make request and handle response or error
            makeRequest(
              that,
              entry.method,
              url,
              payload
            ).end().then(function(res) {
              // If the response is not 200 OK (or 2xx)
              if (!res.ok) {
                // Decide if we should retry
                if (attempts < that._options.maxRetries &&
                    500 <= res.status &&  // Check if it's a 5xx error
                    res.status < 600) {
                  debug("Error calling: %s now retrying, info: %j",
                        entry.name, res.body);
                  return retryRequest();
                }
                // If not retrying, construct error object and reject
                debug("Error calling: %s NOT retrying!, info: %j",
                      entry.name, res.body);
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
                return reject(err);
              }
              // If request was successful, accept the result
              debug("Success calling: %s, (%s retries)",
                    entry.name, attempts - 1);
              return accept(res.body);
            }, function(err) {
              // Decide if we should retry
              if (attempts < that._options.maxRetries) {
                debug("Request error calling %s (retrying), err: %s, JSON: %s",
                      entry.name, err, err);
                return retryRequest();
              }
              debug("Request error calling %s NOT retrying!, err: %s, JSON: %s",
                    entry.name, err, err);
              return reject(err);
            });
          }

          // Increment attempt count, but track how many we had before
          var retries = attempts;
          attempts += 1;

          // If this is the first retry, ie we haven't retried yet, we make the
          // request immediately
          if (retries === 0) {
            sendRequest();
          } else {
            setTimeout(sendRequest, retries * retries * 100);
          }
        };

        // Start the retry request loop
        retryRequest();
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

      // Create bewit (this is messed up, function differs in browser)
      var bewit = (hawk.client.getBewit || hawk.client.bewit)(requestUrl, {
        credentials:    {
          id:         this._options.credentials.clientId,
          key:        this._options.credentials.accessToken,
          algorithm:  'sha256'
        },
        ttlSec:         expiration,
        ext:            this._extData
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
