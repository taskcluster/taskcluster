/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import got, { TimeoutError } from 'got';

import debugFactory from 'debug';
const debug = debugFactory('@taskcluster/client');
import _ from 'lodash';
import assert from 'assert';
import hawk from 'hawk';
import url from 'url';
import crypto from 'crypto';
import slugid from 'slugid';
import http from 'http';
import https from 'https';
import querystring from 'querystring';
import tcUrl from 'taskcluster-lib-urls';
import retry from './retry.js';

/** Default options for our http/https global agents */
let AGENT_OPTIONS = {
  maxSockets: 50,
  maxFreeSockets: 0,
  keepAlive: false,
};

/**
 * Generally shared agents is optimal we are creating our own rather then
 * defaulting to the global node agents primarily so we can tweak this across
 * all our components if needed...
 */
let DEFAULT_AGENTS = {
  http: new http.Agent(AGENT_OPTIONS),
  https: new https.Agent(AGENT_OPTIONS),
};

// Exports agents, consumers can provide their own default agents and tests
// can call taskcluster.agents.http.destroy() when running locally, otherwise
// tests won't terminate (if they are configured with keepAlive)
export const agents = DEFAULT_AGENTS;

// By default, all requests to a service go the the rootUrl and
// are load-balanced to services from there. However, if running
// inside a kubernetes cluster, you can opt to
// use kubernetes DNS to access other Taskcluster services
// These are something like `my-svc.my-namespace.svc.cluster-domain.example`
// but k8s also sets up search domains where the first one is
// `my-namespace.svc.cluster-domain.example` so you can just make a
// request to `my-svc` and it will route correctly
const SERVICE_DISCOVERY_SCHEMES = ['default', 'k8s-dns'];
let DEFAULT_SERVICE_DISCOVERY_SCHEME = 'default';

export const setServiceDiscoveryScheme = scheme => {
  DEFAULT_SERVICE_DISCOVERY_SCHEME = scheme;
};

// Default options stored globally for convenience
let _defaultOptions = {
  credentials: {
    clientId: undefined,
    accessToken: undefined,
    certificate: undefined,
  },
  // Request time out (defaults to 30 seconds)
  timeout: 30 * 1000,
  // Max number of request retries
  retries: 5,
  // Multiplier for computation of retry delay: 2 ^ retry * delayFactor,
  // 100 ms is solid for servers, and 500ms - 1s is suitable for background
  // processes
  delayFactor: 100,
  // Randomization factor added as.
  // delay = delay * random([1 - randomizationFactor; 1 + randomizationFactor])
  randomizationFactor: 0.25,
  // Maximum retry delay (defaults to 30 seconds)
  maxDelay: 30 * 1000,

  // The prefix of any api calls. e.g. https://taskcluster.net/api/
  rootUrl: undefined,

  // See above for what this means
  serviceDiscoveryScheme: undefined,

  // Fake methods, if given this will produce a fake client object.
  // Methods called won't make expected HTTP requests, but instead:
  //   1. Add arguments to `Client.fakeCalls.<method>.push({...params, payload, query})`
  //   2. Invoke and return `fake.<method>(...args)`
  //
  // This allows `Client.fakeCalls.<method>` to be used for assertions, and
  // `fake.<method>` can be used inject fake implementations.
  fake: null,
};

/** Make a request for a Client instance */
export const makeRequest = async function(client, method, url, payload, query) {
  // Add query to url if present
  if (query) {
    query = querystring.stringify(query);
    if (query.length > 0) {
      url += '?' + query;
    }
  }

  const options = {
    method: method.toUpperCase(),
    agent: client._httpAgent,
    followRedirect: false,
    timeout: {
      request: client._timeout,
    },
    headers: {},
    responseType: 'text',
    retry: {
      limit: 0,
    },
    hooks: {
      afterResponse: [res => {
        // parse the body, if one was given (Got's `responseType: json` fails to check content-type)
        if (res.rawBody.length > 0 && (res.headers['content-type'] || '').startsWith('application/json')) {
          res.body = JSON.parse(res.rawBody);
        }
        return res;
      }],
    },
  };

  if (client._options.traceId) {
    options.headers['x-taskcluster-trace-id'] = client._options.traceId;
  }

  // Authenticate, if credentials are provided
  if (client._options.credentials &&
      client._options.credentials.clientId &&
      client._options.credentials.accessToken) {
    // Create hawk authentication header
    let header = hawk.client.header(url, method.toUpperCase(), {
      credentials: {
        id: client._options.credentials.clientId,
        key: client._options.credentials.accessToken,
        algorithm: 'sha256',
      },
      ext: client._extData,
    });
    options.headers['Authorization'] = header.header;
  }

  // Send payload if defined
  if (payload !== undefined) {
    options.json = payload;
  }

  let res;
  try {
    res = await got(url, options);
  } catch (err) {
    // translate errors as users expect them, for compatibility
    if (err instanceof TimeoutError) {
      err.code = 'ECONNABORTED';
    }
    throw err;
  }

  return res;
};

/**
 * Create a client class from a JSON reference, and an optional `name`, which is
 * mostly intended for debugging, error messages and stats.
 *
 * Returns a Client class which can be initialized with following options:
 * options:
 * {
 *   // Taskcluster credentials, if not provided fallback to defaults from
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
 *   retries:         5,                             // Maximum number of retries
 *   rootUrl:         'https://taskcluster.net/api/' // prefix for all api calls
 * }
 *
 * `rootUrl` and `baseUrl` are mutually exclusive.
 */
export const createClient = function(reference, name) {
  if (!name || typeof name !== 'string') {
    name = 'Unknown';
  }

  // Client class constructor
  let Client = function(options) {
    if (options && options.baseUrl) {
      throw new Error('baseUrl has been deprecated!');
    }
    if (options && options.exchangePrefix) {
      throw new Error('exchangePrefix has been deprecated!');
    }
    let serviceName = reference.serviceName;

    // allow for older schemas; this should be deleted once it is no longer used.
    if (!serviceName) {
      if (reference.name) {
        // it was called this for a while; https://bugzilla.mozilla.org/show_bug.cgi?id=1463207
        serviceName = reference.name;
      } else if (reference.baseUrl) {
        serviceName = reference.baseUrl.split('//')[1].split('.')[0];
      } else if (reference.exchangePrefix) {
        serviceName = reference.exchangePrefix.split('/')[1].replace('taskcluster-', '');
      }
    }
    this._options = _.defaults({}, options || {}, {
      exchangePrefix: reference.exchangePrefix,
      serviceName,
      serviceVersion: 'v1',
    }, _defaultOptions);
    assert(this._options.rootUrl, 'Must provide a rootUrl'); // We always assert this even with service discovery
    this._options.rootUrl = this._options.rootUrl.replace(/\/$/, '');
    this._options._trueRootUrl = this._options.rootUrl.replace(/\/$/, ''); // Useful for buildUrl/buildSignedUrl in certain cases

    this._options.serviceDiscoveryScheme = this._options.serviceDiscoveryScheme || DEFAULT_SERVICE_DISCOVERY_SCHEME;
    if (!SERVICE_DISCOVERY_SCHEMES.includes(this._options.serviceDiscoveryScheme)) {
      throw new Error(`Invalid Taskcluster client service discovery scheme: ${this._options.serviceDiscoveryScheme}`);
    }

    if (this._options.serviceDiscoveryScheme === 'k8s-dns') {
      this._options.rootUrl = `http://taskcluster-${serviceName}`; // Notice this is http, not https
    }

    if (this._options.stats || this._options.monitor) {
      throw new Error('monitoring client calls is no longer supported');
    }

    if (this._options.randomizationFactor < 0 ||
        this._options.randomizationFactor >= 1) {
      throw new Error('options.randomizationFactor must be between 0 and 1!');
    }

    if (this._options.agent) {
      // We have explicit options for new agent create one...
      this._httpAgent = {
        https: new https.Agent(this._options.agent),
        http: new http.Agent(this._options.agent),
      };
    } else {
      // Use default global agent(s)...
      this._httpAgent = {
        https: DEFAULT_AGENTS.https,
        http: DEFAULT_AGENTS.http,
      };
    }

    // Timeout for each _individual_ http request.
    this._timeout = this._options.timeout;

    // Build ext for hawk requests
    this._extData = undefined;
    if (this._options.credentials &&
        this._options.credentials.clientId &&
        this._options.credentials.accessToken) {
      let ext = {};

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
        this._extData = Buffer.from(JSON.stringify(ext)).toString('base64');
      }
    }

    // If fake, we create an array this.fakeCalls[method] = [] for each method
    if (this._options.fake) {
      debug('Creating @taskcluster/client object in "fake" mode');
      this.fakeCalls = {};
      reference.entries.filter(e => e.type === 'function').forEach(e => this.fakeCalls[e.name] = []);
      // Throw an error if creating fakes in production
      if (process.env.NODE_ENV === 'production') {
        new Error('@taskcluster/client object created in "fake" mode, when NODE_ENV == "production"');
      }
    }
  };

  Client.prototype.use = function(optionsUpdates) {
    let options = _.defaults({}, optionsUpdates, { rootUrl: this._options._trueRootUrl }, this._options);
    return new Client(options);
  };

  Client.prototype.taskclusterPerRequestInstance = function({ requestId, traceId }) {
    return this.use({ traceId });
  };

  // For each function entry create a method on the Client class
  reference.entries.filter(function(entry) {
    return entry.type === 'function';
  }).forEach(function(entry) {
    // Get number of arguments
    let nb_args = entry.args.length;
    if (entry.input) {
      nb_args += 1;
    }
    // Get the query-string options taken
    let optKeys = entry.query || [];

    // Create method on prototype
    Client.prototype[entry.name] = function() {
      // Convert arguments to actual array
      let args = Array.prototype.slice.call(arguments);
      // Validate number of arguments
      let N = args.length;
      if (N !== nb_args && (optKeys.length === 0 || N !== nb_args + 1)) {
        throw new Error('Function ' + entry.name + ' takes ' + nb_args +
                        ' arguments, but was given ' + N +
                        ' arguments');
      }
      // Substitute parameters into route
      let endpoint = entry.route.replace(/<([^<>]+)>/g, function(text, arg) {
        let index = entry.args.indexOf(arg);
        if (index !== -1) {
          let param = args[index];
          if (typeof param !== 'string' && typeof param !== 'number') {
            throw new Error('URL parameter ' + arg + ' must be a string, but ' +
                            'we received a: ' + typeof param);
          }
          return encodeURIComponent(param);
        }
        return text; // Preserve original
      });
      // Create url for the request
      let url = tcUrl.api(this._options.rootUrl, this._options.serviceName, this._options.serviceVersion, endpoint);
      // Add payload if one is given
      let payload = undefined;
      if (entry.input) {
        payload = args[nb_args - 1];
      }
      // Find query string options (if present)
      let query = args[nb_args] || null;
      if (query) {
        _.keys(query).forEach(function(key) {
          if (!_.includes(optKeys, key)) {
            throw new Error('Function ' + entry.name + ' takes options: ' +
                            optKeys.join(', ') + ' but was given ' + key);
          }
        });
      }

      // call out to the fake version, if set
      if (this._options.fake) {
        debug('Faking call to %s(%s)', entry.name, args.map(a => JSON.stringify(a, null, 2)).join(', '));
        // Add a call record to fakeCalls[<method>]
        let record = {};
        if (payload !== undefined) {
          record.payload = _.cloneDeep(payload);
        }
        if (query !== null) {
          record.query = _.cloneDeep(query);
        }
        entry.args.forEach((k, i) => record[k] = _.cloneDeep(args[i]));
        this.fakeCalls[entry.name].push(record);
        // Call fake[<method>]
        if (!this._options.fake[entry.name]) {
          return Promise.reject(new Error(
            `Faked ${this._options.serviceName} object does not have an implementation of ${entry.name}`,
          ));
        }
        return this._options.fake[entry.name].apply(this, args);
      }

      return retry(this._options, (retriableError, attempt) => {
        debug('Calling: %s, retry: %s', entry.name, attempt);
        // Make request and handle response or error
        return makeRequest(
          this,
          entry.method,
          url,
          payload,
          query,
        ).then(function(res) {
          // If request was successful, accept the result
          debug('Success calling: %s, (%s retries)', entry.name, attempt);
          if (!_.includes(res.headers['content-type'], 'application/json') || !res.body) {
            debug('Empty response from server: call: %s, method: %s', entry.name, entry.method);
            return undefined;
          }
          return res.body;
        }, function(err) {
          // If we got a response we read the error code from the response
          let res = err.response;
          if (res) {
            let message = 'Unknown Server Error';
            if (res.statusCode === 401) {
              message = 'Authentication Error';
            }
            if (res.statusCode === 500) {
              message = 'Internal Server Error';
            }
            if (res.statusCode >= 300 && res.statusCode < 400) {
              message = 'Unexpected Redirect';
            }
            err = new Error(res.body.message || message);
            err.body = res.body;
            err.code = res.body.code || 'UnknownError';
            err.statusCode = res.statusCode;

            // Decide if we should retry or just throw
            if (res.statusCode >= 500 && // Check if it's a 5xx error
                res.statusCode < 600) {
              debug('Error calling: %s now retrying, info: %j',
                entry.name, res.body);
              return retriableError(err);
            } else {
              debug('Error calling: %s NOT retrying!, info: %j',
                entry.name, res.body);
              throw err;
            }
          }

          // All errors without a response are treated as retriable
          debug('Request error calling %s (retrying), err: %s, JSON: %s',
            entry.name, err, err);
          return retriableError(err);
        });
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
          let value = routingKeyPattern[key.name];
          // Routing key constant entries cannot be modified
          if (key.constant) {
            value = key.constant;
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
            'Value: \'' + value + '\' is not supported as routingKey ' +
                'pattern for ' + key.name);
          // Return default pattern for entry not being matched
          return key.multipleWords ? '#' : '*';
        }).join('.');
      }

      // Return values necessary to bind with EventHandler
      return {
        exchange: this._options.exchangePrefix + entry.exchange,
        routingKeyPattern: routingKeyPattern,
        routingKeyReference: _.cloneDeep(entry.routingKey),
      };
    };
  });

  Client.prototype._buildUrl = function(rootUrl, args) {
    if (args.length === 0) {
      throw new Error('buildUrl(method, arg1, arg2, ...) takes a least one ' +
                        'argument!');
    }
    // Find the method
    let method = args.shift();
    let entry = method.entryReference;
    if (!entry || entry.type !== 'function') {
      throw new Error('method in buildUrl(method, arg1, arg2, ...) must be ' +
                        'an API method from the same object!');
    }

    // Get the query-string options taken
    let optKeys = entry.query || [];
    let supportsOpts = optKeys.length !== 0;

    debug('build url for: ' + entry.name);
    // Validate number of arguments
    let N = entry.args.length;
    if (args.length !== N && (!supportsOpts || args.length !== N + 1)) {
      throw new Error('Function ' + entry.name + 'buildUrl() takes ' +
                        (N + 1) + ' arguments, but was given ' +
                        (args.length + 1) + ' arguments');
    }

    // Substitute parameters into route
    let endpoint = entry.route.replace(/<([^<>]+)>/g, function(text, arg) {
      let index = entry.args.indexOf(arg);
      if (index !== -1) {
        let param = args[index];
        if (typeof param !== 'string' && typeof param !== 'number') {
          throw new Error('URL parameter ' + arg + ' must be a string, but ' +
                            'we received a: ' + typeof param);
        }
        return encodeURIComponent(param);
      }
      return text; // Preserve original
    });

    // Find query string options (if present)
    let query = args[N] || '';
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

    return tcUrl.api(rootUrl, this._options.serviceName, this._options.serviceVersion, endpoint) + query;
  };

  // Utility functions to build the request URL for given method and
  // input parameters. The first builds with whatever rootUrl currently
  // is while the latter builds with trueRootUrl for sending to users
  Client.prototype.buildUrl = function() {
    return this._buildUrl(this._options.rootUrl, Array.prototype.slice.call(arguments));
  };
  Client.prototype.externalBuildUrl = function() {
    return this._buildUrl(this._options._trueRootUrl, Array.prototype.slice.call(arguments));
  };

  Client.prototype._buildSignedUrl = function(builder, args) {
    if (args.length === 0) {
      throw new Error('buildSignedUrl(method, arg1, arg2, ..., [options]) ' +
                        'takes a least one argument!');
    }

    // Find method and reference entry
    let method = args[0];
    let entry = method.entryReference;
    if (entry.method !== 'get') {
      throw new Error('buildSignedUrl only works for GET requests');
    }

    // Default to 15 minutes before expiration
    let expiration = 15 * 60;

    // Check if method supports query-string options
    let supportsOpts = (entry.query || []).length !== 0;

    // if longer than method + args, then we have options too
    let N = entry.args.length + 1;
    if (supportsOpts) {
      N += 1;
    }
    if (args.length > N) {
      // Get request options
      let options = args.pop();

      // Get expiration from options
      expiration = options.expiration || expiration;

      // Complain if expiration isn't a number
      if (typeof expiration !== 'number') {
        throw new Error('options.expiration must be a number');
      }
    }

    // Build URL
    let requestUrl = builder.apply(this, args);

    // Check that we have credentials
    if (!this._options.credentials.clientId) {
      throw new Error('credentials must be given');
    }
    if (!this._options.credentials.accessToken) {
      throw new Error('accessToken must be given');
    }

    // Create bewit
    let bewit = hawk.client.getBewit(requestUrl, {
      credentials: {
        id: this._options.credentials.clientId,
        key: this._options.credentials.accessToken,
        algorithm: 'sha256',
      },
      ttlSec: expiration,
      ext: this._extData,
    });

    // Add bewit to requestUrl
    let urlParts = url.parse(requestUrl);
    if (urlParts.search) {
      urlParts.search += '&bewit=' + bewit;
    } else {
      urlParts.search = '?bewit=' + bewit;
    }

    // Return formatted URL
    return url.format(urlParts);
  };

  // Utility function to construct a bewit URL for GET requests. Same convention
  // as unsigned buildUrl applies here too
  Client.prototype.buildSignedUrl = function() {
    return this._buildSignedUrl(this.buildUrl, Array.prototype.slice.call(arguments));
  };
  Client.prototype.externalBuildSignedUrl = function() {
    return this._buildSignedUrl(this.externalBuildUrl, Array.prototype.slice.call(arguments));
  };

  // Return client class
  return Client;
};

// Load data from apis.js
import apis from './apis.js';

export const clients = {
  Auth: createClient(apis.Auth.reference, "Auth"),
  AuthEvents: createClient(apis.AuthEvents.reference, "AuthEvents"),
  Github: createClient(apis.Github.reference, "Github"),
  GithubEvents: createClient(apis.GithubEvents.reference, "GithubEvents"),
  Hooks: createClient(apis.Hooks.reference, "Hooks"),
  HooksEvents: createClient(apis.HooksEvents.reference, "HooksEvents"),
  Index: createClient(apis.Index.reference, "Index"),
  Notify: createClient(apis.Notify.reference, "Notify"),
  NotifyEvents: createClient(apis.NotifyEvents.reference, "NotifyEvents"),
  Object: createClient(apis.Object.reference, "Object"),
  PurgeCache: createClient(apis.PurgeCache.reference, "PurgeCache"),
  Queue: createClient(apis.Queue.reference, "Queue"),
  QueueEvents: createClient(apis.QueueEvents.reference, "QueueEvents"),
  Secrets: createClient(apis.Secrets.reference, "Secrets"),
  WebServer: createClient(apis.WebServer.reference, "WebServer"),
  WorkerManager: createClient(apis.WorkerManager.reference, "WorkerManager"),
  WorkerManagerEvents: createClient(apis.WorkerManagerEvents.reference, "WorkerManagerEvents"),
};

/**
 * Update default configuration
 *
 * Example: `Client.config({credentials: {...}});`
 */
export const config = function(options) {
  _defaultOptions = _.defaults({}, options, _defaultOptions);
};

export const fromEnvVars = function() {
  let results = {};
  for (let { env, path } of [
    { env: 'TASKCLUSTER_ROOT_URL', path: 'rootUrl' },
    { env: 'TASKCLUSTER_CLIENT_ID', path: 'credentials.clientId' },
    { env: 'TASKCLUSTER_ACCESS_TOKEN', path: 'credentials.accessToken' },
    { env: 'TASKCLUSTER_CERTIFICATE', path: 'credentials.certificate' },
  ]) {
    if (process.env[env]) {
      _.set(results, path, process.env[env]);
    }
  }
  return results;
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
export const createTemporaryCredentials = function(options) {
  assert(options, 'options are required');

  let now = new Date();

  // Set default options
  options = _.defaults({}, options, {
    // Clock drift is handled in auth service (PR #117)
    // so no clock skew required.
    start: now,
    scopes: [],
  }, _defaultOptions);

  // Validate options
  assert(options.credentials, 'options.credentials is required');
  assert(options.credentials.clientId,
    'options.credentials.clientId is required');
  assert(options.credentials.accessToken,
    'options.credentials.accessToken is required');
  assert(options.credentials.certificate === undefined ||
         options.credentials.certificate === null,
  'temporary credentials cannot be used to make new temporary ' +
         'credentials; ensure that options.credentials.certificate is null');
  assert(options.start instanceof Date, 'options.start must be a Date');
  assert(options.expiry instanceof Date, 'options.expiry must be a Date');
  assert(options.scopes instanceof Array, 'options.scopes must be an array');
  options.scopes.forEach(function(scope) {
    assert(typeof scope === 'string',
      'options.scopes must be an array of strings');
  });
  assert(options.expiry.getTime() - options.start.getTime() <=
         31 * 24 * 60 * 60 * 1000, 'Credentials cannot span more than 31 days');

  let isNamed = !!options.clientId;

  if (isNamed) {
    assert(options.clientId !== options.credentials.clientId,
      'Credential issuer must be different from the name');
  }

  // Construct certificate
  let cert = {
    version: 1,
    scopes: _.cloneDeep(options.scopes),
    start: options.start.getTime(),
    expiry: options.expiry.getTime(),
    seed: slugid.v4() + slugid.v4(),
    signature: null, // generated later
  };
  if (isNamed) {
    cert.issuer = options.credentials.clientId;
  }

  // Construct signature
  let sig = crypto.createHmac('sha256', options.credentials.accessToken);
  sig.update('version:' + cert.version + '\n');
  if (isNamed) {
    sig.update('clientId:' + options.clientId + '\n');
    sig.update('issuer:' + options.credentials.clientId + '\n');
  }
  sig.update('seed:' + cert.seed + '\n');
  sig.update('start:' + cert.start + '\n');
  sig.update('expiry:' + cert.expiry + '\n');
  sig.update('scopes:\n');
  sig.update(cert.scopes.join('\n'));
  cert.signature = sig.digest('base64');

  // Construct temporary key
  let accessToken = crypto
    .createHmac('sha256', options.credentials.accessToken)
    .update(cert.seed)
    .digest('base64')
    .replace(/\+/g, '-') // Replace + with - (see RFC 4648, sec. 5)
    .replace(/\//g, '_') // Replace / with _ (see RFC 4648, sec. 5)
    .replace(/=/g, ''); // Drop '==' padding

  // Return the generated temporary credentials
  return {
    clientId: isNamed ? options.clientId : options.credentials.clientId,
    accessToken: accessToken,
    certificate: JSON.stringify(cert),
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
export const credentialInformation = function(rootUrl, credentials) {
  let result = {};
  let issuer = credentials.clientId;

  result.clientId = issuer;
  result.active = true;

  // distinguish permacreds from temporary creds
  if (credentials.certificate) {
    result.type = 'temporary';
    let cert;
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

  let anonClient = new clients.Auth({ rootUrl });
  let clientLookup = anonClient.client(issuer).then(function(client) {
    let expires = new Date(client.expires);
    if (!result.expiry || result.expiry > expires) {
      result.expiry = expires;
    }
    if (client.disabled) {
      result.active = false;
    }
  });

  let credClient = new clients.Auth({ rootUrl, credentials });
  let scopeLookup = credClient.currentScopes().then(function(response) {
    result.scopes = response.scopes;
  });

  return Promise.all([clientLookup, scopeLookup]).then(function() {
    // re-calculate "active" based on updated start/expiration
    let now = new Date();
    if (result.start && result.start > now) {
      result.active = false;
    } else if (result.expiry && now > result.expiry) {
      result.active = false;
    }

    return result;
  });
};
