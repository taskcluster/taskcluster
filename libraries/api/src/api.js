var express = require('express');
var Debug = require('debug');
var Promise = require('promise');
var hawk = require('hawk');
var aws = require('aws-sdk');
var assert = require('assert');
var _ = require('lodash');
var bodyParser = require('body-parser');
var path = require('path');
var fs = require('fs');
var scopes = require('taskcluster-lib-scopes');
var crypto = require('crypto');
var taskcluster = require('taskcluster-client');
var Ajv = require('ajv');
var typeis = require('type-is');
var errors = require('./errors');
var ScopeExpressionTemplate = require('./expressions');

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
    'This endpoint is used to check that the service is up.',
  ].join('\n'),
  handler: function(req, res) {
    res.status(200).json({
      alive:    true,
      uptime:   process.uptime(),
    });
  },
};

var debug = Debug('api');

/* In production, log authorizations so they are included in papertrail regardless of
 * DEBUG settings; otherwise, log with debug
 */
var authLog = (...args) => console.log(...args);
if (process.env.NODE_ENV !== 'production') {
  var authLog = Debug('api.authz');
}

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
      'Pattern given for param: \'' + param + '\' must be a RegExp or ' +
           'a function');
  });
  return function(req, res, next) {
    var errors = [];
    _.forIn(req.params, function(val, param) {
      var pattern = options[param];
      if (pattern instanceof RegExp) {
        if (!pattern.test(val)) {
          errors.push(
            'URL parameter \'' + param + '\' given as \'' + val + '\' must match ' +
            'regular expression: \'' + pattern.toString() + '\''
          );
        }
      } else if (pattern instanceof Function) {
        var msg = pattern(val);
        if (typeof msg === 'string') {
          errors.push(
            'URL parameter \'' + param + '\' given  as \'' + val +  '\' is not ' +
            'valid: ' + msg
          );
        }
      }
    });
    if (errors.length > 0) {
      return res.reportError(
        'InvalidRequestArguments',
        'Invalid URL patterns:\n' + errors.join('\n'),
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
          'Payload must be JSON with content-type: application/json ' +
          'got content-type: {{contentType}}', {
            contentType: req.headers['content-type'] || null,
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
      if (!req.hasAuthed) {
        let err = new Error('Deferred auth was never checked!');
        return res.reportInternalError(err, {apiMethodName: options.name});
      }
      // If we're supposed to validate outgoing messages and output schema is
      // defined, then we have to validate against it...
      if (options.output !== undefined && !options.skipOutputValidation &&
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
        if (typeof msg === 'string') {
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
    size:               250,
  });
  var nextnonce = 0;
  var N = options.size;
  var noncedb = new Array(N);
  for (var i = 0; i < N; i++) {
    noncedb[i] = {nonce: null, ts: null};
  }
  return function(nonce, ts, cb) {
    for (var i = 0; i < N; i++) {
      if (noncedb[i].nonce === nonce && noncedb[i].ts === ts) {
        debug('CRITICAL: Replay attack detected!');
        return cb(new Error('Signature already used'));
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
  assert(options.authBaseUrl, 'options.authBaseUrl is required');
  var auth = new taskcluster.Auth({
    baseUrl: options.authBaseUrl,
    credentials: {}, // We do this to avoid sending auth headers to authenticateHawk
  });
  return function(data) {
    return auth.authenticateHawk(data);
  };
};

/**
 * Authenticate client using remote API end-point and validate that it satisfies
 * a specified scope expression. Skips validation if `options.scopes` is
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
 *   scopes:  {AnyOf: [
 *     'service:method:action:<resource>'
 *     {AllOf: ['admin', 'superuser']},
 *   ]},
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
 *  * `req.authorize(params, options)`
 *  * `await req.scopes()`
 *  * `await req.clientId()`
 *
 * The `req.authorize(params, options)` method will substitute params
 * into the scope expression in `options.scopes`. This can happen in one of three
 * ways:
 *
 * First is that any strings with `<foo>` in them will have `<foo>` replaced
 * by whatever parameter you pass in to authorize that has the key `foo`. It
 * must be a string to be substituted in this manner.
 *
 * Second is a case where an object of the form
 * `{for: 'foo', in: 'bar', each: 'baz:<foo>'}`. In this case, the param
 * `bar` must be an array and each element of `bar` will be substituted
 * into the string in `each` in the same way as described above for regular
 * strings. The results will then be concatenated into the array that this
 * object is a part of. An example:
 *
 * options.scopes = {AnyOf: ['abc', {for: 'foo', in: 'bar', each: '<foo>:baz'}]}
 *
 * params = {bar: ['def', 'qed']}
 *
 * results in:
 *
 * {AnyOf: [
 *   'abc',
 *   'def:baz',
 *   'qed:baz',
 * ]}
 *
 * Third is an object of the form `{if: 'foo', then: ...}`.
 * In this case if the parameter `foo` is a boolean and true, then the
 * object will be substituted with the scope expression specified
 * in `then`. No truthiness conversions will be done for you.
 * This is useful for allowing methods to be called
 * when certain cases happen such as an artifact beginning with the
 * string "public/".
 *
 * Params specified in `<...>` or the `in` part of the objects are allowed to
 * use dotted syntax to descend into params. Example:
 *
 * options.scopes = {AllOf: ['whatever:<foo.bar>]}
 *
 * params = {foo: {bar: 'abc'}}
 *
 * results in:
 *
 * {AllOf: ['whatever:abc']}
 *
 * The `req.authorize(params, options)` method returns `true` if the
 * client satisfies the scope expression in `options.scopes` after the
 * parameters denoted by `<...>` and `{for: ..., each: ..., in: ...}` are
 * substituted in. If the client does not satisfy the scope expression, it
 * throws an Error with code = 'AuthorizationError'.
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
    'Expected options.signatureValidator to be a function!');
  // Returns promise for object on the form:
  //   {status, message, scopes, scheme, hash}
  // scopes, scheme, hash are only present if status isn't auth-failed
  var authenticate = async function(req) {
    // Check that we're not using two authentication schemes, we could
    // technically allow two. There are cases where we redirect and it would be
    // smart to let bewit overwrite header authentication.
    // But neither Azure or AWS tolerates two authentication schemes,
    // so this is probably a fair policy for now. We can always allow more.
    if (req.headers && req.headers.authorization &&
        req.query && req.query.bewit) {
      return Promise.resolve({
        status:   'auth-failed',
        message:  'Cannot use two authentication schemes at once ' +
                  'this request has both bewit in querystring and ' +
                  'and \'authorization\' header',
      });
    }

    // If no authentication is provided, we just return valid with zero scopes
    if ((!req.query || !req.query.bewit) &&
        (!req.headers || !req.headers.authorization)) {
      return Promise.resolve({
        status: 'no-auth',
        scheme: 'none',
        scopes: [],
      });
    }

    // Parse host header
    var host = hawk.utils.parseHost(req);
    // Find port, overwrite if forwarded by reverse proxy
    var port = host.port;
    if (req.headers['x-forwarded-port'] !== undefined) {
      port = parseInt(req.headers['x-forwarded-port'], 10);
    }

    // Send input to signatureValidator (auth server or local validator)
    let result = await Promise.resolve(options.signatureValidator({
      method:           req.method.toLowerCase(),
      resource:         req.originalUrl,
      host:             host.name,
      port:             parseInt(port, 10),
      authorization:    req.headers.authorization,
    }, options));

    // Validate request hash if one is provided
    if (typeof result.hash === 'string' && result.scheme === 'hawk') {
      var hash = hawk.crypto.calculatePayloadHash(
        new Buffer(req.text, 'utf-8'),
        'sha256',
        req.headers['content-type']
      );
      if (!crypto.timingSafeEqual(Buffer.from(result.hash), Buffer.from(hash))) {
        // create a fake auth-failed result with the failed hash
        result = {
          status: 'auth-failed',
          message:
            'Invalid payload hash: {{hash}}\n' +
            'Computed payload hash: {{computedHash}}\n' +
            'This happens when your request carries a signed hash of the ' +
            'payload and the hash doesn\'t match the hash we\'ve computed ' +
            'on the server-side.',
          computedHash: hash,
        };
      }
    }

    return result;
  };

  // Compile the scopeTemplate
  let scopeTemplate;
  let useUrlParams = false;
  if (entry.scopes) {
    scopeTemplate = new ScopeExpressionTemplate(entry.scopes);
    // Write route parameters into {[param]: ''}
    // if these are valid parameters, then we can parameterize using req.params
    let [, params] = cleanRouteAndParams(entry.route);
    params = Object.assign({}, ...params.map(p => ({[p]: ''})));
    useUrlParams = scopeTemplate.validate(params);
  }

  return async function(req, res, next) {
    let result;
    try {
      /** Create method that returns list of scopes the caller has */
      req.scopes = async function() {
        result = await (result || authenticate(req));
        if (result.status !== 'auth-success') {
          return Promise.resolve([]);
        }
        return Promise.resolve(result.scopes || []);
      };

      req.clientId = async () => {
        result = await (result || authenticate(req));
        if (result.status === 'auth-success') {
          return result.clientId || 'unknown-clientId';
        }
        return 'auth-failed:' + result.status;
      };

      req.expires = async () => {
        result = await (result || authenticate(req));
        if (result.status === 'auth-success') {
          return new Date(result.expires);
        }
        return undefined;
      };

      req.satisfies = function() {
        throw new Error('req.satisfies is deprecated! use req.authorize instead');
      };

      /**
       * Create method to check if request satisfies the scope expression. Given
       * extra parameters.
       * Return true, if successful and if unsuccessful it throws an Error with
       * code = 'AuthorizationError'.
       */
      req.authorize = async function(params) {
        result = await (result || authenticate(req));

        // If authentication failed
        if (result.status === 'auth-failed') {
          res.set('www-authenticate', 'hawk');
          res.reportError('AuthenticationFailed', result.message, result);
          return false;
        }

        // Render the scope expression template
        const scopeExpression = scopeTemplate.render(params);

        // Test that we have scope intersection, and hence, is authorized
        let authed = !scopeExpression || scopes.satisfiesExpression(result.scopes, scopeExpression);
        req.hasAuthed = true;

        if (!authed) {
          const err = new Error('Authorization failed'); // This way instead of subclassing due to babel/babel#3083
          err.name = 'AuthorizationError';
          err.code = 'AuthorizationError';
          err.messageTemplate = [
            'You do not have sufficient scopes. You are missing the following scopes:',
            '',
            '{{unsatisfied}}',
            '',
            'You have the scopes:',
            '',
            '{{scopes}}',
            '',
            'This request requires you to satisfy this scope expression:',
            '',
            '{{required}}',
          ].join('\n');
          err.details = {
            scopes: result.scopes,
            required: scopeExpression,
            unsatisfied: scopes.removeGivenScopes(result.scopes, scopeExpression),
          };
          throw err;
        }

        // TODO: log this in a structured format when structured logging is
        // available https://bugzilla.mozilla.org/show_bug.cgi?id=1307271
        authLog(`Authorized ${await req.clientId()} for ${req.method} access to ${req.originalUrl}`);
      };

      req.hasAuthed = false;

      // If authentication is deferred or satisfied, then we proceed,
      // substituting the request parameters by default
      if (!entry.scopes) {
        req.hasAuthed = true;  // No need to check auth if there are no scopes
        next();
      } else {
        // If url parameters is enough to parameterize we do it automatically
        if (useUrlParams) {
          await req.authorize(req.params);
        }
        next();
      }
    } catch (err) {
      if (err.code === 'AuthorizationError') {
        return res.reportError('InsufficientScopes', err.messageTemplate, err.details);
      }
      return res.reportInternalError(err, {apiMethodName: entry.name});
    };
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
  assert(handler, 'No handler is provided');
  return function(req, res) {
    Promise.resolve(null).then(function() {
      return handler.call(context, req, res);
    }).then(function() {
      if (!req.hasAuthed) {
        // Note: This will not fail the request since a response has already
        // been sent at this point. It will report to sentry however!
        // This is only to catch the case where people do not use res.reply()
        let err = new Error('req.authorize was never called, or some parameters were missing from the request');
        return res.reportInternalError(err, {apiMethodName: name});
      }
    }).catch(function(err) {
      if (err.code === 'AuthorizationError') {
        return res.reportError('InsufficientScopes', err.messageTemplate, err.details);
      }
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
    assert(options[key], 'Option \'' + key + '\' must be provided');
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
    assert(/[A-Z][A-Za-z0-9]*/.test(key), 'Invalid error code: ' + key);
    assert(typeof value === 'number', 'Expected HTTP status code to be int');
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
  stable:           'stable',
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
 *   noPublish: true                             // defaults to false, causes
 *                                               // endpoint to be left out of api
 *                                               // references
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
    assert(options[key], 'Option \'' + key + '\' must be provided');
  });
  // Default to experimental API end-points
  if (!options.stability) {
    options.stability = stability.experimental;
  }
  assert(STABILITY_LEVELS.indexOf(options.stability) !== -1,
    'options.stability must be a valid stability-level, ' +
         'see base.API.stability for valid options');
  options.params = _.defaults({}, options.params || {}, this._options.params);
  options.query = options.query || {};
  _.forEach(options.query, (value, key) => {
    if (!(value instanceof RegExp || value instanceof Function)) {
      throw new Error('query.' + key + ' must be a RegExp or a function!');
    }
  });
  assert(!options.deferAuth,
    'deferAuth is deprecated! https://github.com/taskcluster/taskcluster-lib-api#request-handlers');
  if ('scopes' in options && !ScopeExpressionTemplate.validate(options.scopes)) {
    throw new Error(`Invalid scope expression template: ${JSON.stringify(options.scopes, null, 2)}`);
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
      authBaseUrl:        options.authBaseUrl || AUTH_BASE_URL,
    }),
    raven:                null,
  });

  // Validate context
  this._options.context.forEach(function(property) {
    assert(options.context[property] !== undefined,
      'Context must have declared property: \'' + property + '\'');
  });

  // Create caching authentication strategy if possible
  if (options.clientLoader || options.credentials) {
    throw new Error('options.clientLoader and options.credentials are no longer ' +
                    'supported; use remote signature validation');
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
        'CONNECT',
      ].join(','));
      res.header('Access-Control-Request-Method', '*');
      res.header('Access-Control-Allow-Headers',  [
        'X-Requested-With',
        'Content-Type',
        'Authorization',
        'Accept',
        'Origin',
      ].join(','));
      next();
    });
  }

  router.use(function(req, res, next) {
    res.header('Cache-Control', 'no-store no-cache must-revalidate');
    next();
  });

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
        entry.name, this._options.errorCodes, monitor || options.raven,
        entry.cleanPayload
      ),
      bodyParser.text({
        limit:          options.inputLimit,
        type:           'application/json',
      }), function(req, res, next) {
        // Use JSON middleware, and add hack to store text as req.text
        if (typeof req.body === 'string' && req.body !== '') {
          req.text = req.body;
          try {
            req.body = JSON.parse(req.text);
            if (!(req.body instanceof Object)) {
              throw new Error('Must be an object or array');
            }
          } catch (err) {
            return res.reportError(
              'MalformedPayload', 'Failed to parse JSON: {{errMsg}}', {
                errMsg: err.message,
              });
          }
        } else {
          req.text = '';
          req.body = {};
        }
        next();
      },
      remoteAuthentication({
        signatureValidator: options.signatureValidator,
      }, entry),
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

/** Return [route, params] from route */
const cleanRouteAndParams = (route) => {
  // Find parameters for entry
  const params = [];
  // Note: express uses the NPM module path-to-regexp for parsing routes
  // when modifying this to support more complicated routes it can be
  // beneficial lookup the source of this module:
  // https://github.com/component/path-to-regexp/blob/0.1.x/index.js
  route = route.replace(/\/:(\w+)(\(.*?\))?\??/g, (match, param) => {
    params.push(param);
    return '/<' + param + '>';
  });
  return [route, params];
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
  assert(options,         'Options is required');
  assert(options.baseUrl, 'A \'baseUrl\' must be provided');
  var reference = {
    version:            0,
    $schema:          'http://schemas.taskcluster.net/base/v1/' +
                        'api-reference.json#',
    title:              this._options.title,
    description:        this._options.description,
    baseUrl:            options.baseUrl,
    entries: _.concat(this._entries, [ping]).filter(entry => !entry.noPublish).map(function(entry) {
      const [route, params] = cleanRouteAndParams(entry.route);
      var retval = {
        type:           'function',
        method:         entry.method,
        route:          route,
        query:          _.keys(entry.query || {}),
        args:           params,
        name:           entry.name,
        stability:      entry.stability,
        title:          entry.title,
        description:    entry.description,
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
    }),
  };

  var ajv = Ajv({useDefaults: true, format: 'full', verbose: true, allErrors: true});
  var schemaPath = path.join(__dirname, 'schemas', 'api-reference.json');
  var schema = fs.readFileSync(schemaPath, {encoding: 'utf-8'});
  var validate = ajv.compile(JSON.parse(schema));

  // Check against it
  var valid = validate(reference);
  if (!valid) {
    debug('Reference:\n%s', JSON.stringify(reference, null, 2));
    throw new Error(`API.references(): Failed to validate against schema:\n
      ${ajv.errorsText(validate.errors, {separator: '\n  * '})}`);
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
    referenceBucket:    'references.taskcluster.net',
  });
  // Check that required options are provided
  ['baseUrl', 'referencePrefix', 'aws'].forEach(function(key) {
    assert(options[key], 'Option \'' + key + '\' must be provided');
  });
  // Create S3 object
  var s3 = new aws.S3(options.aws);
  // Upload object
  return s3.putObject({
    Bucket:           options.referenceBucket,
    Key:              options.referencePrefix,
    Body:             JSON.stringify(this.reference(options), undefined, 2),
    ContentType:      'application/json',
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
