"use strict";

var express       = require('express');
var debug         = require('debug')('base:api');
var Promise       = require('promise');
var uuid          = require('uuid');
var hawk          = require('hawk');
var aws           = require('aws-sdk');
var assert        = require('assert');
var _             = require('lodash');
var bodyParser    = require('body-parser');
var path          = require('path');
var fs            = require('fs');
require('superagent-hawk')(require('superagent'));
var request       = require('superagent-promise');
var scopes        = require('taskcluster-lib-scopes');
var crypto        = require('crypto');
var cryptiles     = require('cryptiles');
var taskcluster   = require('taskcluster-client');
var Ajv           = require('ajv');
var errors        = require('./errors');
var typeis        = require('type-is');

// Default baseUrl for authentication server
var AUTH_BASE_URL = 'https://auth.taskcluster.net/v1';

var ping = {
  method:   'get',
  route:    '/ping',
  name:     'ping',
  stability:  'stable',
  title:    'Ping Server',
  description: [
    'Respond without doing anything.',
    'This endpoint is used to check that the service is up.'
  ].join('\n'),
  handler: function(req, res) {
    res.status(200).json({
      alive:    true,
      uptime:   process.uptime()
    });
  }
};

/**
 * Create parameter validation middle-ware instance, given a mapping from
 * parameter to regular expression or function that returns a message as string
 * if the parameter is invalid.
 *
 * options:
 * {
 *   param1: /.../,               // Reg-exp pattern
 *   param2(val) { return "..." } // Function, returns message if invalid
 * }
 *
 * Parameters not listed in `req.params` will be ignored. But parameters
 * present must match the pattern given in `options` or the request will be
 * rejected with a 400 error message.
 */
var parameterValidator = function(options) {
  // Validate options
  _.forIn(options, function(pattern, param) {
    assert(pattern instanceof RegExp || pattern instanceof Function,
           "Pattern given for param: '" + param + "' must be a RegExp or " +
           "a function");
  });
  return function(req, res, next) {
    var errors = [];
    _.forIn(req.params, function(val, param) {
      var pattern = options[param];
      if (pattern instanceof RegExp) {
        if (!pattern.test(val)) {
          errors.push(
            "URL parameter '" + param + "' given as '" + val + "' must match " +
            "regular expression: '" + pattern.toString() + "'"
          );
        }
      } else if (pattern instanceof Function) {
        var msg = pattern(val);
        if (typeof(msg) === 'string') {
          errors.push(
            "URL parameter '" + param + "' given  as '" + val +  "' is not " +
            "valid: " + msg
          );
        }
      }
    });
    if (errors.length > 0) {
      return res.reportError(
        'InvalidRequestArguments',
        "Invalid URL patterns:\n" + errors.join('\n'),
        {errors}
      );
    }
    return next();
  };
};

/**
 * Declare {input, output} schemas as options to validate
 *
 * options:
 * {
 *   input:    'http://schemas...input-schema.json',   // optional, null if no input
 *   output:   'http://schemas...output-schema.json',  // optional, null if no output
 *   skipInputValidation:    true,                     // defaults to false
 *   skipOutputValidation:   true,                     // defaults to false
 *   name:     '...',                                  // method name for debug
 * }
 *
 * This validates body against the schema given in `options.input` and returns
 * and a 400 error messages to request if there is a schema mismatch.
 * Handlers below this should output the reply JSON structure with `req.reply`.
 * this will validate it against `outputSchema` if provided.
 * Handlers may output errors using `req.json`, as `req.reply` will validate
 * against schema and always returns a 200 OK reply.
 */
var schema = function(validate, options) {
  return function(req, res, next) {
    // If input schema is defined we need to validate the input
    if (options.input !== undefined && !options.skipInputValidation) {
      if (!typeis(req, 'application/json')) {
        return res.reportError(
          'MalformedPayload',
          "Payload must be JSON with content-type: application/json " +
          "got content-type: {{contentType}}", {
          contentType: (req.headers['content-type'] || null),
        });
      }
      var error = validate(req.body, options.input);
      if (error) {
        debug('Input schema validation error: ' + error);
        return res.reportError(
          'InputValidationError',
          error,
        {schema: options.input});
      }
    }
    // Add a reply method sending JSON replies, this will always reply with HTTP
    // code 200... errors should be sent with res.json(code, json)
    res.reply = function(json) {
      // If we're supposed to validate outgoing messages and output schema is
      // defined, then we have to validate against it...
      if(options.output !== undefined && !options.skipOutputValidation &&
         options.output !== 'blob') {
        var error = validate(json, options.output);
        if (error) {
          debug('Output schema validation error: ' + error);
          let err = new Error('Output schema validation error: ' + error);
          err.schema = options.output;
          err.url = req.url;
          err.payload = json;
          return res.reportInternalError(err, {apiMethodName: options.name});
        }
      }
      // If JSON was valid or validation was skipped then reply with 200 OK
      res.status(200).json(json);
    };

    // Call next piece of middleware, typically the handler...
    next();
  };
};


/**
 * Validate query-string against query.
 *
 * options:
 * {
 *   param1: /.../,               // Reg-exp pattern
 *   param2(val) { return "..." } // Function, returns message if invalid
 * }
 *
 * Query-string options not specified in options will not be allowed. But it's
 * optional if a request carries any query-string parameters at all.
 */
let queryValidator = function(options = {}) {
  return function(req, res, next) {
    let errors = [];
    _.forEach(req.query || {}, (value, key) => {
      let pattern = options[key];
      if (!pattern) {
        // Allow the bewit key, it's used in signed strings
        if (key === 'bewit') {
          return;
        }
        // Unsupported option
        errors.push('Query-string parameter: ' + key + ' is not supported!');
      }
      if (pattern instanceof RegExp) {
        if (!pattern.test(value)) {
          errors.push('Query-string parameter: ' + key + '="' + value +
                      '" does not match expression: ' + pattern.toString());
        }
      } else {
        let msg = pattern(value);
        if (typeof(msg) === 'string') {
          errors.push('Query-string parameter: ' + key + '="' + value +
                      '" is not valid, error: ' + msg);
        }
      }
    });
    if (errors.length > 0) {
      return res.reportError(
        'InvalidRequestArguments',
        errors.join('\n'),
        {errors}
      );
    }
    return next();
  };
};

/**
 * Local nonce cache for hawk, using an over-approximation
 *
 * options:
 * {
 *   size:             250   // Number of entries to keep track of
 * }
 *
 * Higher size helps mitigate replay attacks, but also takes more memory.
 * Please, note that this doesn't do much for replay-attacks if there are
 * multiple instance of the server process. But it's better than nothing,
 * and a lot cheaper and faster than using azure table storage.
 *
 * Ideally, nonces should probably be stored in something like memcache.
 */
var nonceManager = function(options) {
  options = _.defaults({}, options || {}, {
    size:               250
  });
  var nextnonce = 0;
  var N = options.size;
  var noncedb = new Array(N);
  for(var i = 0; i < N; i++) {
    noncedb[i] = {nonce: null, ts: null};
  }
  return function(nonce, ts, cb) {
    for (var i = 0; i < N; i++) {
      if (noncedb[i].nonce === nonce && noncedb[i].ts === ts) {
        debug("CRITICAL: Replay attack detected!");
        return cb(new Error("Signature already used"));
      }
    }
    noncedb[nextnonce].nonce  = nonce;
    noncedb[nextnonce].ts     = ts;
    // Increment nextnonce
    nextnonce += 1;
    nextnonce %= N;
    cb();
  };
};

/**
 * Make a function for the remote signature validation.
 *
 * options:
 * {
 *    authBaseUrl:   'https://....' // baseUrl for authentication server
 * }
 *
 * The function returns takes an object:
 *     {method, resource, host, port, authorization}
 * And return promise for an object on one of the forms:
 *     {status: 'auth-failed', message},
 *     {status: 'auth-success', scheme, scopes}, or,
 *     {status: 'auth-success', scheme, scopes, hash}
 *
 * The method returned by this function works as `signatureValidator` for
 * `remoteAuthentication`.
 */
var createRemoteSignatureValidator = function(options) {
  assert(options.authBaseUrl, "options.authBaseUrl is required");
  var auth = new taskcluster.Auth({
    baseUrl: options.authBaseUrl
  });
  return function(data) {
    return auth.authenticateHawk(data);
  };
};

/**
 * Authenticate client using remote API end-point and validate that he satisfies
 * one of the sets of scopes required. Skips validation if `options.scopes` is
 * `undefined`.
 *
 * options:
 * {
 *    signatureValidator:   async (data) => {message}, {scheme, scopes}, or
 *                                          {scheme, scopes, hash}
 * },
 *
 * where `data` is the form: {method, url, host, port, authorization}.
 *
 * entry:
 * {
 *   scopes:  [
 *     'service:method:action:<resource>'
 *     ['admin', 'superuser'],
 *   ]
 *   deferAuth:   false, // defaults to false
 *   name:        '...', // API end-point name for internal errors
 * }
 *
 * Check that the client is authenticated and has scope patterns that satisfies
 * either `'service:method:action:<resource>'` or both `'admin'` and
 * `'superuser'`. If the client has pattern "service:*" this will match any
 * scope that starts with "service:" as is the case in the example above.
 *
 * The request grows the following properties:
 *
 *  * `req.satisfies(scopesets, noReply)`
 *  * `await req.scopes()`
 *  * `await req.clientId()`
 *
 * The `req.satisfies(scopesets, noReply)` method returns `true` if the
 * client satisfies one of the scopesets. If the client does not satisfy one
 * of the scopesets, it returns `false` and sends an error message unless
 * `noReply = true`.
 *
 * If `deferAuth` is set to `true`, then authentication will be postponed to
 * the first invocation of `req.satisfies`. Further note, that if
 * `req.satisfies` is called with an object as first argument (instead of a
 * list), then it'll assume this object is a mapping from scope parameters to
 * values. e.g. `req.satisfies({resource: "my-resource"})` will check that
 * the client satisfies `'service:method:action:my-resource'`.
 * (This is useful when working with dynamic scope strings).
 *
 * Note that `deferAuth` will not perform authorization unless, `req.satisfies({})`
 * is called either without arguments or with an object as first argument.
 *
 * If `deferAuth` is false, then req.params will be used as the scope parameters.
 *
 * The `req.scopes()` method returns a Promise for the set of scopes the caller
 * has. Please, note that `req.scopes()` returns `[]` if there was an
 * authentication error.
 *
 * The `req.clientId` function returns (via Promise) the requesting clientId,
 * or the reason no clientId is known (`auth-failed:status`).  This value can
 * be used for logging and auditing, but should **never** be used for access
 * control.
 *
 * If authentication was successful, `req.expires()` returns (via Promise) the
 * expiration time of the credentials used to make this request.  If the
 * response includes some additional security token, its duration should be
 * limited to this expiration time.
 *
 * Reports 401 if authentication fails.
 */
var remoteAuthentication = function(options, entry) {
  assert(options.signatureValidator instanceof Function,
         "Expected options.signatureValidator to be a function!");
  // Returns promise for object on the form:
  //   {status, message, scopes, scheme, hash}
  // scopes, scheme, hash are only present if status isn't auth-failed
  var authenticate = function(req) {
    // Check that we're not using two authentication schemes, we could
    // technically allow two. There are cases where we redirect and it would be
    // smart to let bewit overwrite header authentication.
    // But neither Azure or AWS tolerates two authentication schemes,
    // so this is probably a fair policy for now. We can always allow more.
    if (req.headers && req.headers.authorization &&
        req.query && req.query.bewit) {
      return Promise.resolve({
        status:   'auth-failed',
        message:  "Cannot use two authentication schemes at once " +
                  "this request has both bewit in querystring and " +
                  "and 'authorization' header"
      });
    }

    // If no authentication is provided, we just return valid with zero scopes
    if ((!req.query || !req.query.bewit) &&
        (!req.headers || !req.headers.authorization)) {
      return Promise.resolve({
        status: 'no-auth',
        scheme: 'none',
        scopes: []
      });
    }

    // Parse host header
    var host = hawk.utils.parseHost(req);
    // Find port, overwrite if forwarded by reverse proxy
    var port = host.port;
    if (req.headers['x-forwarded-port'] !== undefined) {
      port = parseInt(req.headers['x-forwarded-port']);
    }

    // Send input to signatureValidator (auth server or local validator)
    return Promise.resolve(options.signatureValidator({
      method:           req.method.toLowerCase(),
      resource:         req.originalUrl,
      host:             host.name,
      port:             parseInt(port),
      authorization:    req.headers.authorization
    }, options));
  };

  return function(req, res, next) {
    return authenticate(req).then(function(result) {
      // Validate request hash if one is provided
      if (typeof(result.hash) === 'string' && result.scheme === 'hawk') {
        var hash = hawk.crypto.calculatePayloadHash(
          new Buffer(req.text, 'utf-8'),
          'sha256',
          req.headers['content-type']
        );
        if (!cryptiles.fixedTimeComparison(result.hash, hash)) {
          // create a fake auth-failed result with the failed hash
          result = {
            status: 'auth-failed',
            message:
              "Invalid payload hash: {{hash}}\n" +
              "Computed payload hash: {{computedHash}}\n" +
              "This happens when your request carries a signed hash of the " +
              "payload and the hash doesn't match the hash we've computed " +
              "on the server-side.",
            computedHash: hash,
          };
        }
      }

      /** Create method that returns list of scopes the caller has */
      req.scopes = function() {
        if (result.status !== 'auth-success') {
          return Promise.resolve([]);
        }
        return Promise.resolve(result.scopes || []);
      };

      let clientId, expires;
      // generate valid clientIds for exceptional cases
      if (result.status === 'auth-success') {
        clientId = result.clientId || 'unknown-clientId';
        expires = new Date(result.expires);
      } else {
        clientId = 'auth-failed:' + result.status;
        expires = undefined;
      }
      // these are functions so we can later make an async request on demand
      req.clientId = async () => clientId;
      req.expires = async () => expires;

      /**
       * Create method to check if request satisfies a scope-set from required
       * set of scope-sets.
       * Return true, if successful and if unsuccessful it replies with
       * error to `res`, unless `noReply` is `true`.
       */
      req.satisfies = function(scopesets, noReply) {
        // If authentication failed
        if (result.status === 'auth-failed') {
          if (!noReply) {
            res.set('www-authenticate', 'hawk');
            res.reportError('AuthenticationFailed', result.message, result);
          }
          return false;
        }

        // If we're not given an array, we assume it's a set of parameters that
        // must be used to parameterize the original scopesets
        if (!(scopesets instanceof Array)) {
          var params = scopesets;
          scopesets = _.cloneDeepWith(entry.scopes, function(scope) {
            if(typeof(scope) === 'string') {
              return scope.replace(/<([^>]+)>/g, function(match, param) {
                var value = params[param];
                return value === undefined ? match : value;
              });
            }
          });
        }

        // Test that we have scope intersection, and hence, is authorized
        var retval = scopes.scopeMatch(result.scopes, scopesets);
        if (retval) {
          // TODO: log this in a structured format when structured logging is
          // available https://bugzilla.mozilla.org/show_bug.cgi?id=1307271
          console.log(
              `Authorized ${clientId} for ${req.method} access to ${req.originalUrl}`)
        }
        if (!retval && !noReply) {
          res.reportError('InsufficientScopes', [
            "You do not have sufficient scopes. This request requires you",
            "to have one of the following sets of scopes:",
            "{{scopesets}}",
            "",
            "You only have the scopes:",
            "{{scopes}}",
            "",
            "In other words you are missing scopes from one of the options:"
          ].concat(scopesets.map((set, index) => {
            let missing = set.filter(scope => {
              return !scopes.scopeMatch(result.scopes, [[scope]]);
            });
            return ' * Option ' + index + ':\n    - "' +
                   missing.join('", and\n    - "') + '"';
          })).join('\n'),  {scopesets, scopes: result.scopes});
        }
        return retval;
      };

      // If authentication is deferred or satisfied, then we proceed,
      // substituting the request paramters by default
      if (!entry.scopes || entry.deferAuth || req.satisfies(req.params)) {
        next();
      }
    }).catch(function(err) {
      return res.reportInternalError(err, {apiMethodName: entry.name});
    });
  };
};

/**
 * Handle API end-point request
 *
 * This invokes the handler with `context` as `this` and then catches
 * exceptions and failures of returned promises handler.
 * Errors are reported as internal errors with `name` as API method name.
 */
var handle = function(handler, context, name) {
  assert(handler, "No handler is provided");
  return function(req, res) {
    Promise.resolve(null).then(function() {
      return handler.call(context, req, res);
    }).catch(function(err) {
      return res.reportInternalError(err, {apiMethodName: name});
    });
  };
};

/**
 * Create an API builder
 *
 * options:
 * {
 *   title:         "API Title",
 *   description:   "API description in markdown",
 *   schemaPrefix:  "http://schemas..../queue/",    // Prefix for all schemas
 *   params: {                                      // Patterns for URL params
 *     param1:  /.../,                // Reg-exp pattern
 *     param2(val) { return "..." }   // Function, returns message if invalid
 *   },
 *   context:       [],               // List of required context properties
 *   errorCodes: {
 *     MyError:     400,              // Mapping from error code to HTTP status
 *   }
 * }
 *
 * The API object will only modified by declarations, when `mount` or `publish`
 * is called it'll use the currently defined entries to mount or publish the
 * API.
 */
var API = function(options) {
  ['title', 'description'].forEach(function(key) {
    assert(options[key], "Option '" + key + "' must be provided");
  });
  this._options = _.defaults({
    errorCodes: _.defaults({}, options.errorCodes || {}, errors.ERROR_CODES),
  }, options, {
    schemaPrefix:   '',
    params:         {},
    context:        [],
    errorCodes:     {},
  });
  _.forEach(this._options.errorCodes, (value, key) => {
    assert(/[A-Z][A-Za-z0-9]*/.test(key), 'Invalid error code: ' + key)
    assert(typeof(value) === 'number', 'Expected HTTP status code to be int');
  });
  this._entries = [];
};

/** Stability levels offered by API method */
var stability = {
  /**
   * API has been marked for deprecation and should not be used in new clients.
   *
   * Note, documentation string for a deprecated API end-point should outline
   * the deprecation strategy.
   */
  deprecated:       'deprecated',
  /**
   * Unless otherwise stated API may change and resources may be deleted
   * without warning. Often we will, however, try to deprecate the API first
   * and keep around as `deprecated`.
   *
   * **Intended Usage:**
   *  - Prototype API end-points,
   *  - API end-points intended displaying unimportant state.
   *    (e.g. API to fetch state from a provisioner)
   *  - Prototypes used in non-critical production by third parties,
   *  - API end-points of little public interest,
   *    (e.g. API to define workerTypes for a provisioner)
   *
   * Generally, this is a good stability levels for anything under-development,
   * or when we know that there is a limited number of consumers so fixing
   * the world after breaking the API is easy.
   */
  experimental:     'experimental',
  /**
   * API is stable and we will not delete resources or break the API suddenly.
   * As a guideline we will always facilitate gradual migration if we change
   * a stable API.
   *
   * **Intended Usage:**
   *  - API end-points used in critical production.
   *  - APIs so widely used that refactoring would be hard.
   */
  stable:           'stable'
};

// List of valid stability-levels
var STABILITY_LEVELS = _.values(stability);

/**
 * Declare an API end-point entry, where options is on the following form:
 *
 * {
 *   method:   'post|head|put|get|delete',
 *   route:    '/object/:id/action/:param',      // URL pattern with parameters
 *   params: {                                   // Patterns for URL params
 *     param: /.../,                             // Reg-exp pattern
 *     id(val) { return "..." }                  // Function, returns message
 *                                               // if value is invalid
 *     // The `params` option from new API(), will be used as fall-back
 *   },
 *   query: {                                    // Query-string parameters
 *     offset: /.../,                            // Reg-exp pattern
 *     limit(n) { return "..." }                 // Function, returns message
 *                                               // if value is invalid
 *     // Query-string options are always optional (at-least in this iteration)
 *   },
 *   name:     'identifierForLibraries',         // identifier for client libraries
 *   stability: base.API.stability.experimental, // API stability level
 *   scopes:   ['admin', 'superuser'],           // Scopes for the request
 *   scopes:   [['admin'], ['per1', 'per2']],    // Scopes in disjunctive form
 *                                               // admin OR (per1 AND per2)
 *   input:    'input-schema.json',              // optional, null if no input
 *   output:   'output-schema.json' || 'blob',   // optional, null if no output
 *   skipInputValidation:    true,               // defaults to false
 *   skipOutputValidation:   true,               // defaults to false
 *   title:     "My API Method",
 *   description: [
 *     "Description of method in markdown, enjoy"
 *   ].join('\n'),
 *   cleanPayload: payload => payload,           // function to 'clean' the payload for
 *                                               // error messages (e.g., remove secrets)
 * }
 *
 * The handler parameter is a normal connect/express request handler, it should
 * return JSON replies with `request.reply(json)` and errors with
 * `request.json(code, json)`, as `request.reply` may be validated against the
 * declared output schema.
 *
 * **Note** the handler may return a promise, if this promise fails we will
 * log the error and return an error message. If the promise is successful,
 * nothing happens.
 */
API.prototype.declare = function(options, handler) {
  ['name', 'method', 'route', 'title', 'description'].forEach(function(key) {
    assert(options[key], "Option '" + key + "' must be provided");
  });
  // Default to experimental API end-points
  if (!options.stability) {
    options.stability = stability.experimental;
  }
  assert(STABILITY_LEVELS.indexOf(options.stability) !== -1,
         "options.stability must be a valid stability-level, " +
         "see base.API.stability for valid options");
  options.params = _.defaults({}, options.params || {}, this._options.params);
  options.query = options.query || {};
  _.forEach(options.query, (value, key) => {
    if (!(value instanceof RegExp || value instanceof Function)) {
      throw new Error('query.' + key + ' must be a RegExp or a function!');
    }
  });
  if ('scopes' in options) {
    scopes.validateScopeSets(options.scopes);
  }
  options.handler = handler;
  if (options.input) {
    options.input = this._options.schemaPrefix + options.input;
  }
  if (options.output && options.output !== 'blob') {
    options.output = this._options.schemaPrefix + options.output;
  }
  this._entries.push(options);
};

/**
 * Construct a router that can be mounted on an express application
 *
 * options:
 * {
 *   inputLimit:          '10mb'  // Max input JSON size
 *   allowedCORSOrigin:   '*'     // Allowed CORS origin, null to disable CORS
 *   context:             {}      // Object to be provided as `this` in handlers
 *   validator:           new base.validator()      // JSON schema validator
 *   nonceManager:        function(nonce, ts, cb) { // Check for replay attack
 *   authBaseUrl:         'http://auth.example.net' // BaseUrl for auth server
 *   monitor:             await require('taskcluster-lib-monitor')({...}),
 * }
 *
 * The option `validator` must provided.
 *
 * Return an `express.Router` instance.
 */
API.prototype.router = function(options) {
  assert(options.validator);

  // Provide default options
  options = _.defaults({}, options, {
    inputLimit:           '10mb',
    allowedCORSOrigin:    '*',
    context:              {},
    nonceManager:         nonceManager(),
    signatureValidator:   createRemoteSignatureValidator({
      authBaseUrl:        options.authBaseUrl || AUTH_BASE_URL
    }),
    raven:                null,
  });

  // Validate context
  this._options.context.forEach(function(property) {
    assert(options.context[property] !== undefined,
           "Context must have declared property: '" + property + "'");
  });

  // Authentication strategy (default to remote authentication)
  var authStrategy = function(entry) {
    return remoteAuthentication({
      signatureValidator: options.signatureValidator
    }, entry);
  };

  // Create caching authentication strategy if possible
  if (options.clientLoader || options.credentials) {
    throw new Error("options.clientLoader and options.credentials are no longer " +
                    "supported; use remote signature validation");
  }

  if (options.drain || options.component || options.raven) {
    console.log('taskcluster-lib-stats is now deprecated!\n' +
                'Use the `monitor` option rather than `drain`.\n' +
                '`monitor` should be an instance of taskcluster-lib-monitor.\n' +
                '`component` is no longer needed. Prefix your `monitor` before use.\n' +
                '`raven` is deprecated. An instance of `monitor` will work instead.');
  }

  var monitor = null;
  if (options.monitor) {
    monitor = options.monitor;
  }

  // Create router
  var router = express.Router();

  // Allow CORS requests to the API
  if (options.allowedCORSOrigin) {
    router.use(function(req, res, next) {
      res.header('Access-Control-Allow-Origin',   options.allowedCORSOrigin);
      res.header('Access-Control-Allow-Methods', [
        'OPTIONS',
        'GET',
        'HEAD',
        'POST',
        'PUT',
        'DELETE',
        'TRACE',
        'CONNECT'
      ].join(','));
      res.header('Access-Control-Request-Method', '*');
      res.header('Access-Control-Allow-Headers',  [
        'X-Requested-With',
        'Content-Type',
        'Authorization',
        'Accept',
        'Origin'
      ].join(','));
      next();
    });
  }

  // Add entries to router
  _.concat(this._entries, [ping]).forEach(entry => {
    // Route pattern
    var middleware = [entry.route];

    if (monitor) {
      middleware.push(monitor.expressMiddleware(entry.name));
    }

    // Add authentication, schema validation and handler
    middleware.push(
      errors.BuildReportErrorMethod(
        entry.name, this._options.errorCodes, (monitor || options.raven),
        entry.cleanPayload
      ),
      bodyParser.text({
        limit:          options.inputLimit,
        type:           'application/json'
      }), function(req, res, next) {
        // Use JSON middleware, and add hack to store text as req.text
        if (typeof(req.body) === 'string' && req.body !== '') {
          req.text = req.body;
          try {
            req.body = JSON.parse(req.text);
            if (!(req.body instanceof Object)) {
              throw new Error("Must be an object or array");
            }
          } catch (err) {
            return res.reportError(
              'MalformedPayload', "Failed to parse JSON: {{errMsg}}", {
                errMsg: err.message
            });
          }
        } else {
          req.text = '';
          req.body = {};
        }
        next();
      },
      authStrategy(entry),
      parameterValidator(entry.params),
      queryValidator(entry.query),
      schema(options.validator, entry),
      handle(entry.handler, options.context, options.name)
    );

    // Create entry on router
    router[entry.method].apply(router, middleware);
  });

  // Return router
  return router;
};


/**
 * Construct API reference as JSON
 *
 * options:
 * {
 *   baseUrl:       'https://example.com/v1'  // URL where routes are mounted
 * }
 */
API.prototype.reference = function(options) {
  assert(options,         "Options is required");
  assert(options.baseUrl, "A 'baseUrl' must be provided");
  var reference = {
    version:            0,
    '$schema':          'http://schemas.taskcluster.net/base/v1/' +
                        'api-reference.json#',
    title:              this._options.title,
    description:        this._options.description,
    baseUrl:            options.baseUrl,
    entries: _.concat(this._entries, [ping]).map(function(entry) {
      // Find parameters for entry
      var params  = [];
      // Note: express uses the NPM module path-to-regexp for parsing routes
      // when modifying this to support more complicated routes it can be
      // beneficial lookup the source of this module:
      // https://github.com/component/path-to-regexp/blob/0.1.x/index.js
      var regexp  = /\/:(\w+)(\(.*?\))?\??/g;
      var route   = entry.route.replace(regexp, function(match, param) {
        params.push(param);
        return '/<' + param + '>';
      });
      var retval = {
        type:           'function',
        method:         entry.method,
        route:          route,
        query:          _.keys(entry.query || {}),
        args:           params,
        name:           entry.name,
        stability:      entry.stability,
        title:          entry.title,
        description:    entry.description
      };
      if (entry.scopes) {
        retval.scopes = entry.scopes;
      }
      if (entry.input) {
        retval.input  = entry.input;
      }
      if (entry.output) {
        retval.output = entry.output;
      }
      return retval;
    })
  };

  var ajv = Ajv({useDefaults: true, format: 'full', verbose: true, allErrors: true});
  var schemaPath = path.join(__dirname, 'schemas', 'api-reference.json');
  var schema = fs.readFileSync(schemaPath, {encoding: 'utf-8'});
  var validate = ajv.compile(JSON.parse(schema));

  // Check against it
  var refSchema = 'http://schemas.taskcluster.net/base/v1/api-reference.json#';
  var valid = validate(reference, refSchema);
  if (!valid) {
    debug("API.references(): Failed to validate against schema, errors: %j " +
          "reference: %j", validate.errors, reference);
    debug("Reference:\n%s", JSON.stringify(reference, null, 2));
    debug("Errors:\n%s", JSON.stringify(validate.errors, null, 2));
    throw new Error("API.references(): Failed to validate against schema");
  }

  return reference;
};

/**
 * Publish API reference to URL with given end-point
 *
 * options:
 * {
 *   baseUrl:         'https://example.com/v1' // URL where routes are mounted
 *   referencePrefix: 'queue/v1/api.json'      // Prefix within S3 bucket
 *   referenceBucket: 'reference.taskcluster.net',
 *   aws: {             // AWS credentials and region
 *    accessKeyId:      '...',
 *    secretAccessKey:  '...',
 *    region:           'us-west-2'
 *   }
 * }
 *
 * Return a promise that reference was published.
 */
API.prototype.publish = function(options) {
  // Provide default options
  options = _.defaults({}, options, {
    referenceBucket:    'references.taskcluster.net'
  });
  // Check that required options are provided
  ['baseUrl', 'referencePrefix', 'aws'].forEach(function(key) {
    assert(options[key], "Option '" + key + "' must be provided");
  });
  // Create S3 object
  var s3 = new aws.S3(options.aws);
  // Upload object
  return s3.putObject({
    Bucket:           options.referenceBucket,
    Key:              options.referencePrefix,
    Body:             JSON.stringify(this.reference(options), undefined, 2),
    ContentType:      'application/json'
  }).promise();
};

/**
 * Setup API, by publishing reference and returning an `express.Router`.  Also
 * documented in the README
 *
 * options:
 * {
 *   inputLimit:          '10mb'  // Max input JSON size
 *   allowedCORSOrigin:   '*'     // Allowed CORS origin, null to disable CORS
 *   context:             {}      // Object to be provided as `this` in handlers
 *   validator:           new base.validator()      // JSON schema validator
 *   nonceManager:        function(nonce, ts, cb) { // Check for replay attack
 *   authBaseUrl:         'http://auth.example.net' // BaseUrl for auth server
 *   publish:             true,                    // Publish API reference
 *   baseUrl:             'https://example.com/v1' // URL under which routes are mounted
 *   referencePrefix:     'queue/v1/api.json'      // Prefix within S3 bucket
 *   referenceBucket:     'reference.taskcluster.net',
 *   aws: {               // AWS credentials and region
 *    accessKeyId:        '...',
 *    secretAccessKey:    '...',
 *    region:             'us-west-2'
 *   }
 * }
 *
 * The option `validator` must provided.
 *
 * Return an `express.Router` instance.
 */
API.prototype.setup = function(options) {
  var that = this;
  return Promise.resolve(null).then(function() {
    if (options.publish) {
      return that.publish(options);
    }
  }).then(function() {
    return that.router(options);
  });
};

// Export API
module.exports = API;

// Export middleware utilities
API.schema        = schema;
API.handle        = handle;
API.stability     = stability;
API.nonceManager  = nonceManager;
API.remoteAuthentication = remoteAuthentication;
