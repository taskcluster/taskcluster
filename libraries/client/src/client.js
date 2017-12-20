/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var request     = require('superagent');
var debug       = require('debug')('taskcluster-client');
var _           = require('lodash');
var assert      = require('assert');
var hawk        = require('hawk');
var url         = require('url');
var crypto      = require('crypto');
var slugid      = require('slugid');
var http        = require('http');
var https       = require('https');
var Promise     = require('promise');
var querystring = require('querystring');

/** Default options for our http/https global agents */
var AGENT_OPTIONS = {
  maxSockets:       50,
  maxFreeSockets:   0,
  keepAlive:        false,
};

/**
 * Generally shared agents is optimal we are creating our own rather then
 * defaulting to the global node agents primarily so we can tweak this across
 * all our components if needed...
 */
var DEFAULT_AGENTS = {
  http:   new http.Agent(AGENT_OPTIONS),
  https:  new https.Agent(AGENT_OPTIONS),
};

// Exports agents, consumers can provide their own default agents and tests
// can call taskcluster.agents.http.destroy() when running locally, otherwise
// tests won't terminate (if they are configured with keepAlive)
exports.agents = DEFAULT_AGENTS;

// Default options stored globally for convenience
var _defaultOptions = {
  credentials: {
    clientId:     process.env.TASKCLUSTER_CLIENT_ID,
    accessToken:  process.env.TASKCLUSTER_ACCESS_TOKEN,
    certificate:  process.env.TASKCLUSTER_CERTIFICATE,
  },
  // Request time out (defaults to 30 seconds)
  timeout:        30 * 1000,
  // Max number of request retries
  retries:        5,
  // Multiplier for computation of retry delay: 2 ^ retry * delayFactor,
  // 100 ms is solid for servers, and 500ms - 1s is suitable for background
  // processes
  delayFactor:    100,
  // Randomization factor added as.
  // delay = delay * random([1 - randomizationFactor; 1 + randomizationFactor])
  randomizationFactor: 0.25,
  // Maximum retry delay (defaults to 30 seconds)
  maxDelay:       30 * 1000,
};

/** Make a request for a Client instance */
var makeRequest = function(client, method, url, payload, query) {
  // Add query to url if present
  if (query) {
    query = querystring.stringify(query);
    if (query.length > 0) {
      url += '?' + query;
    }
  }

  // Construct request object
  var req = request(method.toUpperCase(), url);
  // Set the http agent for this request, if supported in the current
  // environment (browser environment doesn't support http.Agent)
  if (req.agent) {
    req.agent(client._httpAgent);
  }

  // Timeout for each individual request.
  req.timeout(client._timeout);

  // Send payload if defined
  if (payload !== undefined) {
    req.send(payload);
  }

  // Authenticate, if credentials are provided
  if (client._options.credentials &&
      client._options.credentials.clientId &&
      client._options.credentials.accessToken) {
    // Create hawk authentication header
    var header = hawk.client.header(url, method.toUpperCase(), {
      credentials: {
        id:         client._options.credentials.clientId,
        key:        client._options.credentials.accessToken,
        algorithm:  'sha256',
      },
      ext:          client._extData,
    });
    req.set('Authorization', header.field);
  }

  // Return request
  return req;
};

/**
 * Create a client class from a JSON reference, and an optional `name`, which is
 * mostly intended for debugging, error messages and stats.
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
 *   retries:         5,                // Maximum number of retries
 *   monitor:         await Monitor()   // From taskcluster-lib-monitor
 * }
 *
 * `baseUrl` and `exchangePrefix` defaults to values from reference.
 */
exports.createClient = function(reference, name) {
  if (!name || typeof name !== 'string') {
    name = 'Unknown';
  }

  // Client class constructor
  var Client = function(options) {
    this._options = _.defaults({}, options || {}, {
      baseUrl:          reference.baseUrl        || '',
      exchangePrefix:   reference.exchangePrefix || '',
    }, _defaultOptions);

    // Remove possible trailing slash from baseUrl
    this._options.baseUrl = this._options.baseUrl.replace(/\/$/, '');

    if (this._options.stats) {
      throw new Error('options.stats is now deprecated! Use options.monitor instead.');
    }

    if (this._options.randomizationFactor < 0 ||
        this._options.randomizationFactor >= 1) {
      throw new Error('options.randomizationFactor must be between 0 and 1!');
    }

    // Shortcut for which default agent to use...
    var isHttps = this._options.baseUrl.indexOf('https') === 0;

    if (this._options.agent) {
      // We have explicit options for new agent create one...
      this._httpAgent = isHttps ?
        new https.Agent(this._options.agent) :
        new http.Agent(this._options.agent);
    } else {
      // Use default global agent(s)...
      this._httpAgent = isHttps ?
        DEFAULT_AGENTS.https :
        DEFAULT_AGENTS.http;
    }

    // Timeout for each _individual_ http request.
    this._timeout = this._options.timeout;

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
        if (typeof ext.certificate === 'string') {
          try {
            ext.certificate = JSON.parse(ext.certificate);
          } catch (err) {
            debug('Failed to parse credentials.certificate, err: %s, JSON: %j',
              err, err);
            throw new Error('JSON.parse(): Failed for configured certificate');
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

  Client.prototype.use = function(optionsUpdates) {
    var options = _.defaults({}, optionsUpdates, this._options);
    return new Client(options);
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
    // Get the query-string options taken
    var optKeys = entry.query || [];

    // Create method on prototype
    Client.prototype[entry.name] = function() {
      // Convert arguments to actual array
      var args = Array.prototype.slice.call(arguments);
      // Validate number of arguments
      var N = args.length;
      if (N != nb_args && (optKeys.length === 0 || N != nb_args + 1)) {
        throw new Error('Function ' + entry.name + ' takes ' + nb_args +
                        ' arguments, but was given ' + N +
                        ' arguments');
      }
      // Substitute parameters into route
      var endpoint = entry.route.replace(/<([^<>]+)>/g, function(text, arg) {
        var index = entry.args.indexOf(arg);
        if (index !== -1) {
          var param = args[index];
          if (typeof param !== 'string' && typeof param !== 'number') {
            throw new Error('URL parameter ' + arg + ' must be a string, but ' +
                            'we received a: ' + typeof param);
          }
          return encodeURIComponent(param);
        }
        return text; // Preserve original
      });
      // Create url for the request
      var url = this._options.baseUrl + endpoint;
      // Add payload if one is given
      var payload = undefined;
      if (entry.input) {
        payload = args[nb_args - 1];
      }
      // Find query string options (if present)
      var query = args[nb_args] || null;
      if (query) {
        _.keys(query).forEach(function(key) {
          if (!_.includes(optKeys, key)) {
            throw new Error('Function ' + entry.name + ' takes options: ' +
                            optKeys.join(', ') + ' but was given ' + key);
          }
        });
      }

      // Count request attempts
      var attempts = 0;
      var that = this;

      var monitor = this._options.monitor;
      if (monitor) {
        var start = process.hrtime();
      }

      // Retry the request, after a delay depending on number of retries
      var retryRequest = function() {
        // Send request
        var sendRequest = function() {
          debug('Calling: %s, retry: %s', entry.name, attempts - 1);
          // Make request and handle response or error
          return makeRequest(
            that,
            entry.method,
            url,
            payload,
            query
          ).then(function(res) {
            // If request was successful, accept the result
            debug('Success calling: %s, (%s retries)',
              entry.name, attempts - 1);
            if (monitor) {
              var d = process.hrtime(start);
              monitor.measure([entry.name, 'success'], d[0] * 1000 + d[1] / 1000000);
              monitor.count([entry.name, 'success']);
            }
            if (!_.includes(res.headers['content-type'], 'application/json') || !res.body) {
              debug('Empty response from server: call: %s, method: %s', entry.name, entry.method);
              return undefined;
            }
            return res.body;
          }, function(err) {
            // If we got a response we read the error code from the response
            var res = err.response;
            if (res) {
              // Decide if we should retry
              if (attempts <= that._options.retries &&
                  res.status >= 500 &&  // Check if it's a 5xx error
                  res.status < 600) {
                debug('Error calling: %s now retrying, info: %j',
                  entry.name, res.body);
                return retryRequest();
              }
              // If not retrying, construct error object and reject
              debug('Error calling: %s NOT retrying!, info: %j',
                entry.name, res.body);
              var message = 'Unknown Server Error';
              if (res.status === 401) {
                message = 'Authentication Error';
              }
              if (res.status === 500) {
                message = 'Internal Server Error';
              }
              err = new Error(res.body.message || message);
              err.body = res.body;
              err.code = res.body.code || 'UnknownError';
              err.statusCode = res.status;
              if (monitor) {
                var d = process.hrtime(start);

                var state = 'client-error';
                if (res.statusCode >= 500) {
                  state = 'server-error';
                }
                monitor.measure([entry.name, state], d[0] * 1000 + d[1] / 1000000);
                monitor.count([entry.name, state]);
              }
              throw err;
            }

            // Decide if we should retry
            if (attempts <= that._options.retries) {
              debug('Request error calling %s (retrying), err: %s, JSON: %s',
                entry.name, err, err);
              return retryRequest();
            }
            debug('Request error calling %s NOT retrying!, err: %s, JSON: %s',
              entry.name, err, err);
            if (monitor) {
              var d = process.hrtime(start);
              monitor.measure([entry.name, 'connection-error'], d[0] * 1000 + d[1] / 1000000);
              monitor.count([entry.name, 'connection-error']);
            }
            throw err;
          });
        };

        // Increment attempt count, but track how many we had before.
        attempts += 1;

        // If this is the first retry, ie we haven't retried yet, we make the
        // request immediately
        if (attempts === 1) {
          return sendRequest();
        } else {
          var delay;
          // First request is attempt = 1, so attempt = 2 is the first retry
          // we subtract one to get exponents: 1, 2, 3, 4, 5, ...
          delay = Math.pow(2, attempts - 1) * that._options.delayFactor;
          // Apply randomization factor
          var rf = that._options.randomizationFactor;
          delay *= Math.random() * 2 * rf + 1 - rf;
          // Always limit with a maximum delay
          delay = Math.min(delay, that._options.maxDelay);
          // Sleep then send the request
          return new Promise(function(accept) {
            setTimeout(accept, delay);
          }).then(function() {
            return sendRequest();
          });
        }
      };

      // Start the retry request loop
      return retryRequest();
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
      if (typeof routingKeyPattern !== 'string') {
        // Allow for empty routing key patterns
        if (routingKeyPattern === undefined ||
            routingKeyPattern === null) {
          routingKeyPattern = {};
        }
        // Check that the routing key pattern is an object
        assert(routingKeyPattern instanceof Object,
          'routingKeyPattern must be an object');

        // Construct routingkey pattern as string from reference
        routingKeyPattern = entry.routingKey.map(function(key) {
          // Get value for key
          var value = routingKeyPattern[key.name];
          // Routing key constant entries cannot be modified
          if (key.constant) {
            value =  key.constant;
          }
          // If number convert to string
          if (typeof value === 'number') {
            return '' + value;
          }
          // Validate string and return
          if (typeof value === 'string') {
            // Check for multiple words
            assert(key.multipleWords || value.indexOf('.') === -1,
              'routingKey pattern \'' + value + '\' for ' + key.name +
                   ' cannot contain dots as it does not hold multiple words');
            return value;
          }
          // Check that we haven't got an invalid value
          assert(value === null || value === undefined,
            'Value: \'' + value + '\' is not supported as routingKey '+
                'pattern for ' + key.name);
          // Return default pattern for entry not being matched
          return key.multipleWords ? '#' : '*';
        }).join('.');
      }

      // Return values necessary to bind with EventHandler
      return {
        exchange:             this._options.exchangePrefix + entry.exchange,
        routingKeyPattern:    routingKeyPattern,
        routingKeyReference:  _.cloneDeep(entry.routingKey),
      };
    };
  });

  // Utility function to build the request URL for given method and
  // input parameters
  Client.prototype.buildUrl = function() {
    // Convert arguments to actual array
    var args = Array.prototype.slice.call(arguments);
    if (args.length == 0) {
      throw new Error('buildUrl(method, arg1, arg2, ...) takes a least one ' +
                        'argument!');
    }
    // Find the method
    var method = args.shift();
    var entry  = method.entryReference;
    if (!entry || entry.type !== 'function') {
      throw new Error('method in buildUrl(method, arg1, arg2, ...) must be ' +
                        'an API method from the same object!');
    }

    // Get the query-string options taken
    var optKeys = entry.query || [];
    var supportsOpts = optKeys.length !== 0;

    debug('build url for: ' + entry.name);
    // Validate number of arguments
    var N = entry.args.length;
    if (args.length !== N && (!supportsOpts || args.length !== N + 1)) {
      throw new Error('Function ' + entry.name + 'buildUrl() takes ' +
                        (N + 1) + ' arguments, but was given ' +
                        (args.length + 1) + ' arguments');
    }

    // Substitute parameters into route
    var endpoint = entry.route.replace(/<([^<>]+)>/g, function(text, arg) {
      var index = entry.args.indexOf(arg);
      if (index !== -1) {
        var param = args[index];
        if (typeof param !== 'string' && typeof param !== 'number') {
          throw new Error('URL parameter ' + arg + ' must be a string, but ' +
                            'we received a: ' + typeof param);
        }
        return encodeURIComponent(param);
      }
      return text; // Preserve original
    });

      // Find query string options (if present)
    var query = args[N] || '';
    if (query) {
      _.keys(query).forEach(function(key) {
        if (!_.includes(optKeys, key)) {
          throw new Error('Function ' + entry.name + ' takes options: ' +
                            optKeys.join(', ') + ' but was given ' + key);
        }
      });

      query = querystring.stringify(query);
      if (query.length > 0) {
        query = '?' + query;
      }
    }

    return this._options.baseUrl + endpoint + query;
  };

  // Utility function to construct a bewit URL for GET requests
  Client.prototype.buildSignedUrl = function() {
    // Convert arguments to actual array
    var args = Array.prototype.slice.call(arguments);
    if (args.length == 0) {
      throw new Error('buildSignedUrl(method, arg1, arg2, ..., [options]) ' +
                        'takes a least one argument!');
    }

    // Find method and reference entry
    var method = args[0];
    var entry  = method.entryReference;
    if (entry.method !== 'get') {
      throw new Error('buildSignedUrl only works for GET requests');
    }

    // Default to 15 minutes before expiration
    var expiration = 15 * 60;

    // Check if method supports query-string options
    var supportsOpts = (entry.query || []).length !== 0;

    // if longer than method + args, then we have options too
    var N = entry.args.length + 1;
    if (supportsOpts) {
      N += 1;
    }
    if (args.length > N) {
      // Get request options
      var options = args.pop();

      // Get expiration from options
      expiration = options.expiration || expiration;

      // Complain if expiration isn't a number
      if (typeof expiration !== 'number') {
        throw new Error('options.expiration must be a number');
      }
    }

    // Build URL
    var requestUrl = this.buildUrl.apply(this, args);

    // Check that we have credentials
    if (!this._options.credentials.clientId) {
      throw new Error('credentials must be given');
    }
    if (!this._options.credentials.accessToken) {
      throw new Error('accessToken must be given');
    }

    // Create bewit (this is messed up, function differs in browser)
    var bewit = (hawk.client.getBewit || hawk.client.bewit)(requestUrl, {
      credentials:    {
        id:         this._options.credentials.clientId,
        key:        this._options.credentials.accessToken,
        algorithm:  'sha256',
      },
      ttlSec:         expiration,
      ext:            this._extData,
    });

      // Add bewit to requestUrl
    var urlParts = url.parse(requestUrl);
    if (urlParts.search) {
      urlParts.search += '&bewit=' + bewit;
    } else {
      urlParts.search = '?bewit=' + bewit;
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
  exports[name] = exports.createClient(api.reference, name);
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
 *  clientId:     '...',  // *optional* name to create named temporary credential
 *  credentials: {        // (defaults to use global config, if available)
 *    clientId:    '...', // ClientId
 *    accessToken: '...', // AccessToken for clientId
 *  },
 * }
 *
 * Note that a named temporary credential is only valid if the issuing credentials
 * have the scope 'auth:create-client:<name>'.  This function does not check for
 * this scope, but it will be checked when the credentials are used.
 *
 * Returns an object on the form: {clientId, accessToken, certificate}
 */
exports.createTemporaryCredentials = function(options) {
  assert(options, 'options are required');

  var now = new Date();

  // Set default options
  options = _.defaults({}, options, {
    // Clock drift is handled in auth service (PR #117)
    // so no clock skew required.
    start:      now,
    scopes:     [],
  }, _defaultOptions);

  // Validate options
  assert(options.credentials,             'options.credentials is required');
  assert(options.credentials.clientId,
    'options.credentials.clientId is required');
  assert(options.credentials.accessToken,
    'options.credentials.accessToken is required');
  assert(options.credentials.certificate === undefined ||
         options.credentials.certificate === null,
  'temporary credentials cannot be used to make new temporary ' +
         'credentials; ensure that options.credentials.certificate is null');
  assert(options.start instanceof Date,   'options.start must be a Date');
  assert(options.expiry instanceof Date,  'options.expiry must be a Date');
  assert(options.scopes instanceof Array, 'options.scopes must be an array');
  options.scopes.forEach(function(scope) {
    assert(typeof scope === 'string',
      'options.scopes must be an array of strings');
  });
  assert(options.expiry.getTime() - options.start.getTime() <=
         31 * 24 * 60 * 60 * 1000, 'Credentials cannot span more than 31 days');

  var isNamed = !!options.clientId;

  if (isNamed) {
    assert(options.clientId !== options.credentials.clientId,
      'Credential issuer must be different from the name');
  }

  // Construct certificate
  var cert = {
    version:    1,
    scopes:     _.cloneDeep(options.scopes),
    start:      options.start.getTime(),
    expiry:     options.expiry.getTime(),
    seed:       slugid.v4() + slugid.v4(),
    signature:  null,  // generated later
  };
  if (isNamed) {
    cert.issuer = options.credentials.clientId;
  }

  // Construct signature
  var sig = crypto.createHmac('sha256', options.credentials.accessToken);
  sig.update('version:'    + cert.version + '\n');
  if (isNamed) {
    sig.update('clientId:' + options.clientId + '\n');
    sig.update('issuer:'   + options.credentials.clientId + '\n');
  }
  sig.update('seed:'       + cert.seed + '\n');
  sig.update('start:'      + cert.start + '\n');
  sig.update('expiry:'     + cert.expiry + '\n');
  sig.update('scopes:\n');
  sig.update(cert.scopes.join('\n'));
  cert.signature = sig.digest('base64');

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
    clientId:     isNamed ? options.clientId : options.credentials.clientId,
    accessToken:  accessToken,
    certificate:  JSON.stringify(cert),
  };
};

/**
 * Get information about a set of credentials.
 *
 * credentials: {
 *   clientId,
 *   accessToken,
 *   certificate,           // optional
 * }
 *
 * result: Promise for
 * {
 *    clientId: ..,         // name of the credential
 *    type: ..,             // type of credential, e.g., "temporary"
 *    active: ..,           // active (valid, not disabled, etc.)
 *    start: ..,            // validity start time (if applicable)
 *    expiry: ..,           // validity end time (if applicable)
 *    scopes: [...],        // associated scopes (if available)
 * }
 */
exports.credentialInformation = function(credentials) {
  var result = {};
  var issuer = credentials.clientId;

  result.clientId = issuer;
  result.active = true;

  // distinguish permacreds from temporary creds
  if (credentials.certificate) {
    result.type = 'temporary';
    var cert;
    if (typeof credentials.certificate === 'string') {
      try {
        cert = JSON.parse(credentials.certificate);
      } catch (err) {
        return Promise.reject(err);
      }
    } else {
      cert = credentials.certificate;
    }
    result.scopes = cert.scopes;
    result.start = new Date(cert.start);
    result.expiry = new Date(cert.expiry);

    if (cert.issuer) {
      issuer = cert.issuer;
    }
  } else {
    result.type = 'permanent';
  }

  var anonClient = new exports.Auth();
  var clientLookup = anonClient.client(issuer).then(function(client) {
    var expires = new Date(client.expires);
    if (!result.expiry || result.expiry > expires) {
      result.expiry = expires;
    }
    if (client.disabled) {
      result.active = false;
    }
  });

  var credClient = new exports.Auth({credentials: credentials});
  var scopeLookup = credClient.currentScopes().then(function(response) {
    result.scopes = response.scopes;
  });

  return Promise.all([clientLookup, scopeLookup]).then(function() {
    // re-calculate "active" based on updated start/expiration
    var now = new Date();
    if (result.start && result.start > now) {
      result.active = false;
    } else if (result.expiry && now > result.expiry) {
      result.active = false;
    }

    return result;
  });
};
