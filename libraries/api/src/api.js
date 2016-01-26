"use strict";

var express       = require('express');
var debug         = require('debug')('base:api');
var Promise       = require('promise');
var uuid          = require('uuid');
var hawk          = require('hawk');
var aws           = require('aws-sdk-promise');
var assert        = require('assert');
var _             = require('lodash');
var bodyParser    = require('body-parser');
var path          = require('path');
var fs            = require('fs');
require('superagent-hawk')(require('superagent'));
var request       = require('superagent-promise');
// Someone should rename utils to scopes... 
var utils         = require('taskcluster-lib-scopes');
var stats         = require('taskcluster-lib-stats');
var crypto        = require('crypto');
var hoek          = require('hoek');
var series        = require('taskcluster-lib-stats/lib/series');
var http          = require('http');
var https         = require('https');
var cryptiles     = require('cryptiles');
var taskcluster   = require('taskcluster-client');
var Validator     = require('schema-validator-publisher').Validator;
var errors        = require('./errors');
var typeis        = require('type-is');

// Default baseUrl for authentication server
var AUTH_BASE_URL = 'https://auth.taskcluster.net/v1';

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
 * }
 *
 * This validates body against the schema given in `options.input` and returns
 * and a 400 error messages to request if there is a schema mismatch.
 * Handlers below this should output the reply JSON structure with `req.reply`.
 * this will validate it against `outputSchema` if provided.
 * Handlers may output errors using `req.json`, as `req.reply` will validate
 * against schema and always returns a 200 OK reply.
 */
var schema = function(validator, options) {
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
      var errors = validator.check(req.body, options.input);
      if (errors) {
        debug("Request payload for %s didn't follow schema %s",
              req.url, options.input);
        return res.reportError(
          'InputValidationError',
          "Request payload must follow the schema: {{schema}}\n" +
          "Errors: {{errors}}", {
          errors,
          schema: options.input,
          payload: req.body
        });
      }
    }
    // Add a reply method sending JSON replies, this will always reply with HTTP
    // code 200... errors should be sent with res.json(code, json)
    res.reply = function(json) {
      // If we're supposed to validate outgoing messages and output schema is
      // defined, then we have to validate against it...
      if(options.output !== undefined && !options.skipOutputValidation) {
        var errors = validator.check(json, options.output);
        if (errors) {
          debug("Reply for %s didn't match schema: %s got errors: %j from output: %j",
                req.url, options.output, errors, json);
          let err = new Error('Output schema validation of ' + options.output);
          err.schema = options.output;
          err.url = req.url;
          err.errors = errors;
          err.payload = json;
          return res.reportInternalError(err);
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
 * Abstraction of a client with some helper methods
 *
 * options:
 * {
 *   clientId:      '...'       // ClientId for the client
 *   accessToken:   '...'       // AccessToken for clientId
 *   scopes:        []          // List of scope patterns
 *   expires:       new Date()  // Date object or date as string
 * }
 */
var Client = function(options) {
  assert(options.clientId,                "ClientId is required");
  assert(options.accessToken,             "AccessToken is required");
  assert(options.scopes instanceof Array, "Scopes must be an array");
  assert(options.scopes.every(utils.validScope),
                "Scopes must contain only printable ASCII or space");
  if (typeof(options.expires) == 'string') {
    this.expires = new Date(options.expires);
  } else {
    this.expires = options.expires;
  }
  assert(this.expires instanceof Date,    "Expires must be a date");
  assert(isFinite(this.expires),          "Expires must be a valid date");
  this.clientId     = options.clientId;
  this.accessToken  = options.accessToken;
  this.scopes       = options.scopes;
};


/** Check if the client satisfies any of the given scope-sets */
Client.prototype.satisfies = function(scopesets) {
  return utils.scopeMatch(this.scopes, scopesets);
};

/** Check if client credentials are expired */
Client.prototype.isExpired = function() {
  return this.expires < (new Date());
};

/** Create a clone of the client object */
Client.prototype.clone = function() {
  return new Client({
    clientId:       this.clientId,
    accessToken:    this.accessToken,
    scopes:         _.cloneDeep(this.scopes),
    expires:        new Date(this.expires)
  });
};

/** Limit the client scopes and possibly use temporary keys */
Client.prototype.limit = function(ext) {
  // client to return;
  var client = this;

  // Attempt to parse ext
  try {
    var ext = JSON.parse(new Buffer(ext, 'base64').toString('utf-8'));
  }
  catch(err) {
    debug("Failed to parse ext, leave error for signature validation!",
          err, err.stack);
    throw new Error("Failed to parse ext while looking for certificate or " +
                    "authorizedScopes");
  }

  // Handle certificates
  if (ext.certificate) {
    var cert = ext.certificate;
    // Validate the certificate
    if (!(cert instanceof Object)) {
      throw new Error("ext.certificate must be a JSON object");
    }
    if (cert.version !== 1) {
      throw new Error("ext.certificate.version must be 1");
    }
    if (typeof(cert.seed) !== 'string') {
      throw new Error('ext.certificate.seed must be a string');
    }
    if (cert.seed.length !== 44) {
      throw new Error('ext.certificate.seed is too small');
    }
    if (typeof(cert.start) !== 'number') {
      throw new Error('ext.certificate.start must be a number');
    }
    if (typeof(cert.expiry) !== 'number') {
      throw new Error('ext.certificate.expiry must be a number');
    }
    if (!cert.scopes instanceof Array) {
      throw new Error("ext.certificate.scopes must be an array");
    }
    if (!cert.scopes.every(utils.validScope)) {
      throw new Error("ext.certificate.scopes must be an array of valid scopes");
    }

    // Check start and expiry
    var now = new Date().getTime();
    if (cert.start > now) {
      throw new Error("ext.certificate.start > now");
    }
    if (cert.expiry < now) {
      throw new Error("ext.certificate.expiry < now");
    }
    // Check max time between start and expiry
    if (cert.expiry - cert.start > 31 * 24 * 60 * 60 * 1000) {
      throw new Error("ext.certificate cannot last longer than 31 days!");
    }

    // Validate certificate scopes are subset of client
    if (!client.satisfies([cert.scopes])) {
      throw new Error("ext.certificate issuer `" + client.clientId +
                      "` doesn't have sufficient scopes");
    }

    // Generate certificate signature
    var signature = crypto.createHmac('sha256', client.accessToken)
      .update([
        'version:'  + '1',
        'seed:'     + cert.seed,
        'start:'    + cert.start,
        'expiry:'   + cert.expiry,
        'scopes:',
      ].concat(cert.scopes).join('\n'))
      .digest('base64');

    // Validate signature
    if (typeof(cert.signature) !== 'string' ||
        !cryptiles.fixedTimeComparison(cert.signature, signature)){
      throw new Error("ext.certificate.signature is not valid");
    }

    // Regenerate temporary key
    var temporaryKey = crypto.createHmac('sha256', client.accessToken)
      .update(cert.seed)
      .digest('base64')
      .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
      .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
      .replace(/=/g,  '');  // Drop '==' padding

    // Create new client object to return
    client = new Client({
      clientId:       client.clientId,
      accessToken:    temporaryKey,
      scopes:         cert.scopes,
      expires:        new Date(cert.expiry)
    });
  }

  // Handle scope restriction with authorizedScopes
  if (ext.authorizedScopes) {
    // Validate input format
    if (!ext.authorizedScopes instanceof Array) {
      throw new Error("ext.authorizedScopes must be an array");
    }
    if (ext.authorizedScopes.some(function(scope) {
      return typeof(scope) !== 'string';
    })) {
      throw new Error("ext.authorizedScopes must be an array of strings");
    }

    // Validate authorizedScopes scopes are subset of client
    if (!client.satisfies([ext.authorizedScopes])) {
      throw new Error("ext.authorizedScopes oversteps your scopes");
    }

    // Create new client object to return
    client = new Client({
      clientId:       client.clientId,
      accessToken:    client.accessToken,
      scopes:         ext.authorizedScopes,
      expires:        new Date(client.expires)
    });
  }

  // Return client that was created
  return client;
};

/**
 * Create function to find a client from clientId
 *
 * options:
 * {
 *   clientId:          '...',  // TaskCluster clientId
 *   accessToken:       '...',  // Access token for clientId
 *   baseUrl:           '...'   // BaseUrl for authentication server
 * }
 *
 * The client identified by `clientId` must have the scope 'auth:credentials'.
 *
 * Return a function that gives promise for an instance  of `Client`, use the
 * return value with `API.router(...)` or `API.initialize(...)`.
 */
var clientLoader = function(options) {
  options = _.defaults({}, options, {
    baseUrl:          'https://auth.taskcluster.net/v1'
  });
  assert(options.clientId,    "ClientId is required");
  assert(options.accessToken, "AccessToken is required");
  return function(clientId) {
    return request
      .get(options.baseUrl + '/client/' + clientId + '/credentials')
      .hawk({
        id:         options.clientId,
        key:        options.accessToken,
        algorithm:  'sha256'
      })
      .end().then(function(res) {
        if(!res.ok) {
          debug('Failed to fetch credentials for clientId: %s', clientId);
          var err = new Error("Failed to fetch credentials: " + res.text);
          err.message = "Failed to fetch credentials: " + res.text;
          throw err;
        }
        return new Client(res.body);
      });
  };
};

/**
 * Wrapper for a clientLoader that gives it the same interface, but caches
 * results when found.
 *
 * options: {
 *   size:            250,  // Max number of clients to keep in cache
 *   expiration:      60    // Number of minutes to cache clients
 * }
 */
var clientCache = function(clientLoader, options) {
  options = _.defaults({}, options || {
    size:             250,
    expiration:       60
  });
  // Number of milliseconds to keep things in cache
  var expiration = options.expiration * 60 * 60 * 1000;
  var next = 0;
  var N = options.size;
  var cache = new Array(N);
  var defaultClient = {
    clientId:       null,
    __validUntil:   0     // Monkey property we'll add
  };
  for (var i = 0; i < N; i++) {
    cache[i] = defaultClient;
  }
  return function(clientId) {
    // Search cache to see if we have a cached Client object
    var now = new Date().getTime();
    // TODO: There is a long list of optimizations one can do here... Like
    //       start searching from next downwards, and then one can break
    //       when validUntil < now. Furthermore, one can avoid duplicate
    //       clientIds if a clientId twice at once, while not being cached.
    for (var i = 0; i < N; i++) {
      var client = cache[i];
      if (client.clientId === clientId && client.__validUntil > now) {
        return Promise.resolve(client.clone());
      }
    }
    // Load clientId
    return clientLoader(clientId).then(function(client) {
      client.__validUntil = new Date().getTime() + expiration;
      cache[next] = client;
      next += 1;
      next %= N;
      return client.clone();
    });
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
 * Authenticate client and validate that he satisfies one of the sets of scopes
 * required. Skips validation if `options.scopes` is `undefined`.
 *
 * options:
 * {
 *   scopes:  [
 *     'service:method:action:<resource>'
 *     ['admin', 'superuser'],
 *   ]
 *   deferAuth:   false // defaults to false
 * }
 *
 * Check that the client is authenticated and has scope patterns that satisfies
 * either `'service:method:action:<resource>'` or both `'admin'` and
 * `'superuser'`. If the client has pattern "service:*" this will match any
 * scope that starts with "service:" as is the case in the example above.
 *
 * This also adds a method `req.satisfies(scopes, noReply)` to the `request`
 * object. Calling this method with a set of scopes-sets return `true` if the
 * client satisfies one of the scopes-sets. If the client does not satisfy one
 * of the scopes-sets it returns `false` and sends an error message unless
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
 * Remark `deferAuth` will not perform authorization unless, `req.satisfies({})`
 * is called either without arguments or with an object as first argument.
 *
 * This method also adds `req.scopes()` which returns a promise for the set
 * of scopes that the caller has. Please, use `req.satisfies()` whenever
 * possible rather than implement custom scope checking logic.
 *
 * Reports 401 if authentication fails.
 */
var authenticate = function(nonceManager, clientLoader, options) {
  // Load credentials and deal with certificate and restrict scopes, if needed
  var getCredentials = function(clientId, ext, cb) {
    clientLoader(clientId).then(function(client) {
      // Limit client, if ext is provided
      if (ext) {
        // We check certificates and apply limitations to authorizedScopes here,
        // if we've parsed ext incorrectly it could be a security issue, as
        // scope elevation _might_ be possible. But it's a rather unlikely
        // exploit... Besides we have plenty of obscurity to protect us here :)
        client = client.limit(ext);
      }

      // Callback into hawk
      cb(null, {
        clientToken:    client.clientId,
        key:            client.accessToken,
        algorithm:      'sha256',
        client:         client
      });
    }).catch(function(err) {
      cb(err);
    });
  };
  return function(req, res, next) {
    // Callback to handle request from hawk authentication. We currently always
    // authenticate. We could postpone this if `options.deferAuth === true` or
    // if `options.scopes === undefined`. But we should always do
    // authentication if `req.satisfies` is called. In these case do
    // authentication upfront and then ignores the result until `req.satisfies`
    // is called
    var authCallback = function(err, credentials, artifacts) {
      // Keep reference to set of authorized scopes, which will be extended
      // by authenticate()
      var authorizedScopes = [];

      // Make function that will authenticate and return an error if one
      // occurred and otherwise do nothing. This allows us to ignore
      // authentication errors in case authentication is deferred
      var authenticated = false;
      var authenticate = function()  {
        // Don't authenticate twice
        if (authenticated) {
          return;
        }
        // Handle error fetching credentials or validating signature
        if (err) {
          var incidentId = uuid.v4();
          var message = "Ask administrator to lookup incidentId in log-file";
          if (err.output && err.output.payload && err.output.payload.error) {
            message = err.output.payload.error;
            if (err.output.payload.message) {
              message += ": " + err.output.payload.message;
            }
          } else if(err.message) {
            message = err.message;
          }
          debug(
            "Error occurred authenticating, err: %s, %j, incidentId: %s",
            err, err, incidentId, err.stack
          );
          return {
            code: 401,
            payload: {
              message:        "Authentication Error",
              error: {
                info:         message,
                incidentId:   incidentId
              }
            }
          };
        }
        // Check if credentials have expired
        if (credentials.client.isExpired()) {
          return {
            code:     401,
            payload:  {
              message:  "Authentication Failed: TaskCluster credentials expired"
            }
          };
        }
        // Find authorized scopes
        authorizedScopes = credentials.client.scopes;

        // Now we're authenticated
        authenticated = true;
      };

      /** Create method that returns list of scopes the caller have */
      req.scopes = function() {
        return Promise.resolve(authorizedScopes);
      };

      /**
       * Create method to check if request satisfies a scope-set from required
       * set of scope-sets.
       * Return true, if successful and if unsuccessful it replies with
       * error to `res`, unless `noReply` is `true`.
       */
      req.satisfies = function(scopesets, noReply) {
        // Authenticate
        var error = authenticate();
        if (error) {
          if (!noReply) {
            res.status(error.code).json(error.payload);
          }
          return false;
        }

        // Wrap strings if given
        if (typeof(scopesets) === 'string') {
          scopesets = [scopesets];
        }

        // If we're not given an array, we assume it's a set of parameters that
        // must be used to parameterize the original scopesets
        if (!(scopesets instanceof Array)) {
          var params = scopesets;
          scopesets = _.cloneDeep(options.scopes, function(scope) {
            if(typeof(scope) === 'string') {
              return scope.replace(/<([^>]+)>/g, function(match, param) {
                var value = params[param];
                return value === undefined ? match : value;
              });
            }
          });
        }

        // Test that we have scope intersection, and hence, is authorized
        var retval = utils.scopeMatch(authorizedScopes, scopesets);
        if (!retval && !noReply) {
          res.status(401).json({
            message:  "Authorization Failed",
            error: {
              info:       "None of the scope-sets was satisfied",
              scopesets:  scopesets,
            }
          });
        }
        return retval;
      };

      // If we have scopesets to check and authentication isn't deferred
      if (options.scopes != undefined && !options.deferAuth) {
        // Check that request satisfies one of the required scopesets
        if(req.satisfies(options.scopes)) {
          next();
        }
      } else {
        next();
      }
    };

    // Find port in case this request was forwarded by a proxy, say a HTTPS
    // load balancer.
    // TODO: Require that an option on the API says that it's okay to trust
    //       trust the proxy. Otherwise one could use to fake the request port
    //       from an intercepted signature. This is not a significant attack
    //       vector :)
    var port = undefined; // Hawk defaults to parsing it from HOST header
    if (req.headers['x-forwarded-port'] !== undefined) {
      port = parseInt(req.headers['x-forwarded-port']);
    }

    // Restore originalUrl as needed by hawk for authentication
    req.url = req.originalUrl;

    // Check that we're not using two authentication schemes, we could
    // technically allow two. There are cases where we redirect and it would be
    // smart to let bewit overwrite header authentication.
    // But neither Azure or AWS accepts tolerates two authentication schemes,
    // so this is probably a fair policy for now. We can always allow more.
    if (req.headers && req.headers.authorization &&
        req.query && req.query.bewit) {
      return res.status(401).json({
        message:  "Cannot use two authentication schemes at once " +
                  "this request has both bewit in querystring and " +
                  "and 'authorization' header"
      });
    }

    // Check if we should use bewit authentication
    if (req.query && req.query.bewit) {
      hawk.uri.authenticate(req, function(clientId, cb) {
        var ext = undefined;

        // Get bewit string
        var bewitString = hoek.base64urlDecode(req.query.bewit);
        if (!(bewitString instanceof Error)) {
          // Split string as hawk does it
          var parts = bewitString.split('\\');
          if (parts.length === 4 && parts[3]) {
            ext = parts[3];
          }
        }

        // Get credentials with ext
        getCredentials(clientId, ext, cb);
      }, {
        // Provide port
        port:         port
      }, authCallback);
    } else {
      // If no bewit is present we run normal authentication... Even if there
      // is no authentication header. Because we want the warning to say missing
      // 'authentication' header. Not missing bewit signature.
      hawk.server.authenticate(req, function(clientId, cb) {
        var ext = undefined;

        // If we have an authorization header, look for ext
        if (req.headers && req.headers.authorization) {
          // Parse attributes
          var attrs = hawk.utils.parseAuthorizationHeader(
            req.headers.authorization
          );
          // Extra ext
          if (!(attrs instanceof Error)) {
            ext = attrs.ext;
          }
        }

        // Get credentials with ext
        getCredentials(clientId, ext, cb);
      }, {
        // Not sure if JSON stringify is not deterministic by specification.
        // I suspect not, so we'll postpone this till we're sure we want to do
        // payload validation and how we want to do it.
        //payload:      JSON.stringify(req.body),

        // We found that clients often hit time skew bugs (particularly on OSX)
        // since all our services require https we hardcode the allowed skew to
        // a very high number (15 min) similar to AWS.
        timestampSkewSec: 15 * 60,

        // Provide nonce manager
        nonceFunc:    nonceManager,

        // Provide port
        port:         port
      }, authCallback);
    }
  };
};

// Export authentication utilities
authenticate.Client       = Client;
authenticate.clientCache  = clientCache;
authenticate.clientLoader = clientLoader;
authenticate.nonceManager = nonceManager;




/**
 * Limit the client scopes and possibly use temporary keys.
 *
 * Takes a client object on the form: `{clientId, accessToken, scopes}`,
 * applies scope restrictions, certificate validation and returns a clone if
 * modified (otherwise it returns the original).
 */
var limitClientWithExt = function(client, ext, expandScopes) {
  // Attempt to parse ext
  try {
    ext = JSON.parse(new Buffer(ext, 'base64').toString('utf-8'));
  }
  catch(err) {
    debug("Failed to parse ext, leave error for signature validation!",
          err, err.stack);
    throw new Error("Failed to parse ext");
  }

  // Handle certificates
  if (ext.certificate) {
    var cert = ext.certificate;
    // Validate the certificate
    if (!(cert instanceof Object)) {
      throw new Error("ext.certificate must be a JSON object");
    }
    if (cert.version !== 1) {
      throw new Error("ext.certificate.version must be 1");
    }
    if (typeof(cert.seed) !== 'string') {
      throw new Error('ext.certificate.seed must be a string');
    }
    if (cert.seed.length !== 44) {
      throw new Error('ext.certificate.seed is too small');
    }
    if (typeof(cert.start) !== 'number') {
      throw new Error('ext.certificate.start must be a number');
    }
    if (typeof(cert.expiry) !== 'number') {
      throw new Error('ext.certificate.expiry must be a number');
    }
    if (!cert.scopes instanceof Array) {
      throw new Error("ext.certificate.scopes must be an array");
    }
    if (!cert.scopes.every(utils.validScope)) {
      throw new Error("ext.certificate.scopes must be an array of valid scopes");
    }

    // Check start and expiry
    var now = new Date().getTime();
    if (cert.start > now) {
      throw new Error("ext.certificate.start > now");
    }
    if (cert.expiry < now) {
      throw new Error("ext.certificate.expiry < now");
    }
    // Check max time between start and expiry
    if (cert.expiry - cert.start > 31 * 24 * 60 * 60 * 1000) {
      throw new Error("ext.certificate cannot last longer than 31 days!");
    }

    // Check scope validity

    // Validate certificate scopes are subset of client
    if (!utils.scopeMatch(client.scopes, [cert.scopes])) {
      throw new Error("ext.certificate issuer `" + client.clientId +
                      "` doesn't have sufficient scopes");
    }

    // Generate certificate signature
    var signature = crypto.createHmac('sha256', client.accessToken)
      .update([
        'version:'  + '1',
        'seed:'     + cert.seed,
        'start:'    + cert.start,
        'expiry:'   + cert.expiry,
        'scopes:',
      ].concat(cert.scopes).join('\n'))
      .digest('base64');

    // Validate signature
    if (typeof(cert.signature) !== 'string' ||
        !cryptiles.fixedTimeComparison(cert.signature, signature)) {
      throw new Error("ext.certificate.signature is not valid");
    }

    // Regenerate temporary key
    var temporaryKey = crypto.createHmac('sha256', client.accessToken)
      .update(cert.seed)
      .digest('base64')
      .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
      .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
      .replace(/=/g,  '');  // Drop '==' padding

    // Update scopes and accessToken
    client = {
      clientId:     client.clientId,
      accessToken:  temporaryKey,
      scopes:       expandScopes(cert.scopes),
    };
  }

  // Handle scope restriction with authorizedScopes
  if (ext.authorizedScopes) {
    // Validate input format
    if (!ext.authorizedScopes instanceof Array) {
      throw new Error("ext.authorizedScopes must be an array");
    }
    if (!ext.authorizedScopes.every(utils.validScope)) {
      throw new Error("ext.authorizedScopes must be an array of valid scopes");
    }

    // Validate authorizedScopes scopes are subset of client
    if (!utils.scopeMatch(client.scopes, [ext.authorizedScopes])) {
      throw new Error("ext.authorizedScopes oversteps your scopes");
    }

    // Update scopes on client object
    client = {
      clientId:     client.clientId,
      accessToken:  client.accessToken,
      scopes:       expandScopes(ext.authorizedScopes),
    };
  }

  // Return modified client
  return client;
};


/**
 * Make a function for the signature validation.
 *
 * options:
 * {
 *    clientLoader:   async (clientId) => {clientId, accessToken, scopes},
 *    nonceManager:   nonceManager({size: ...}),
 *    expandScopes:   (scopes) => scopes,
 * }
 *
 * The function returned takes an object:
 *     {method, resource, host, port, authorization}
 * And returns promise for an object on one of the forms:
 *     {status: 'auth-failed', message},
 *     {status: 'auth-success', scheme, scopes}, or,
 *     {status: 'auth-success', scheme, scopes, hash}
 *
 * The `expandScopes` applies and rules that expands scopes, such as roles.
 * It is assumed that clients from `clientLoader` are returned with scopes
 * fully expanded.
 *
 * The method returned by this function works as `signatureValidator` for
 * `remoteAuthentication`.
 */
var createSignatureValidator = function(options) {
  assert(typeof(options) === 'object', "options must be an object");
  assert(options.clientLoader instanceof Function,
         "options.clientLoader must be a function");
  if (!options.expandScopes) {
    // Default to the identity function
    options.expandScopes = function(scopes) { return scopes; };
  }
  assert(options.expandScopes instanceof Function,
         "options.expandScopes must be a function");
  var loadCredentials = function(clientId, ext, callback) {
    Promise.resolve(options.clientLoader(clientId)).then(function(client) {
      if (ext) {
        // We check certificates and apply limitations to authorizedScopes here,
        // if we've parsed ext incorrectly it could be a security issue, as
        // scope elevation _might_ be possible. But it's a rather unlikely
        // exploit... Besides we have plenty of obscurity to protect us here :)
        client = limitClientWithExt(client, ext, options.expandScopes);
      }
      callback(null, {
        clientToken:  client.clientId,
        key:          client.accessToken,
        algorithm:    'sha256',
        scopes:       client.scopes
      });
    }).catch(callback);
  };
  return function(req) {
    return new Promise(function(accept) {
      var authenticated = function(err, credentials, artifacts) {
        var result = null;
        if (err) {
          var message = "Unknown authorization error";
          if (err.output && err.output.payload && err.output.payload.error) {
            message = err.output.payload.error;
            if (err.output.payload.message) {
              message += ": " + err.output.payload.message;
            }
          } else if(err.message) {
            message = err.message;
          }
          result = {
            status:   'auth-failed',
            message:  '' + message
          };
        } else {
          result = {
            status:   'auth-success',
            scheme:   'hawk',
            scopes:   credentials.scopes
          };
          if (artifacts.hash) {
            result.hash = artifacts.hash;
          }
        }
        return accept(result);
      };
      if (req.authorization) {
        hawk.server.authenticate({
          method:           req.method.toUpperCase(),
          url:              req.resource,
          host:             req.host,
          port:             req.port,
          authorization:    req.authorization
        }, function(clientId, callback) {
          var ext = undefined;

          // Parse authorization header for ext
          var attrs = hawk.utils.parseAuthorizationHeader(
            req.authorization
          );
          // Extra ext
          if (!(attrs instanceof Error)) {
            ext = attrs.ext;
          }

          // Get credentials with ext
          loadCredentials(clientId, ext, callback);
        }, {
          // Not sure if JSON stringify is not deterministic by specification.
          // I suspect not, so we'll postpone this till we're sure we want to do
          // payload validation and how we want to do it.
          //payload:      JSON.stringify(req.body),

          // We found that clients often have time skew (particularly on OSX)
          // since all our services require https we hardcode the allowed skew
          // to a very high number (15 min) similar to AWS.
          timestampSkewSec: 15 * 60,

          // Provide nonce manager
          nonceFunc:    options.nonceManager
        }, authenticated);
      } else {
      // If there is no authorization header we'll attempt a login with bewit
        hawk.uri.authenticate({
          method:           req.method.toUpperCase(),
          url:              req.resource,
          host:             req.host,
          port:             req.port
        }, function(clientId, callback) {
          var ext = undefined;

          // Get bewit string (stolen from hawk)
          var parts = req.resource.match(
            /^(\/.*)([\?&])bewit\=([^&$]*)(?:&(.+))?$/
          );
          var bewitString = hoek.base64urlDecode(parts[3]);
          if (!(bewitString instanceof Error)) {
            // Split string as hawk does it
            var parts = bewitString.split('\\');
            if (parts.length === 4 && parts[3]) {
              ext = parts[3];
            }
          }

          // Get credentials with ext
          loadCredentials(clientId, ext, callback);
        }, {}, authenticated);
      }
    });
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
 *   deferAuth:   false // defaults to false
 * }
 *
 * Check that the client is authenticated and has scope patterns that satisfies
 * either `'service:method:action:<resource>'` or both `'admin'` and
 * `'superuser'`. If the client has pattern "service:*" this will match any
 * scope that starts with "service:" as is the case in the example above.
 *
 * This also adds a method `req.satisfies(scopes, noReply)` to the `request`
 * object. Calling this method with a set of scopes-sets return `true` if the
 * client satisfies one of the scopes-sets. If the client does not satisfy one
 * of the scopes-sets it returns `false` and sends an error message unless
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
 * Remark `deferAuth` will not perform authorization unless, `req.satisfies({})`
 * is called either without arguments or with an object as first argument.
 *
 * This method also adds `req.scopes()` which returns a promise for the set of
 * scopes the caller has. Please, note that `req.scopes()` returns `[]` if there
 * was an authentication error.
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
      /** Create method that returns list of scopes the caller has */
      req.scopes = function() {
        // Check that we satisfy [], this ensures that payload hash is checked
        // first... Just in case...
        if(req.satisfies([[]], true)) {
          return Promise.resolve(result.scopes || []);
        }
        return Promise.resolve([]);
      };

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
            res.reportError('AuthorizationFailed', result.message, result);
          }
          return false;
        }

        // Validate request hash if one is provided
        if (typeof(result.hash) === 'string' && result.scheme === 'hawk') {
          var hash = hawk.crypto.calculatePayloadHash(
            new Buffer(req.text, 'utf-8'),
            'sha256',
            req.headers['content-type']
          );
          if (!cryptiles.fixedTimeComparison(result.hash, hash)) {
            if (!noReply) {
              res.reportError(
                'AuthorizationFailed',
                "Invalid payload hash: {{hash}}\n" +
                "Computed payload hash: {{computedHash}}\n" +
                "This happens when your request carries a signed hash of the " +
                "payload and the hash doesn't match the hash we've computed " +
                "on the server-side.",
                _.defaults({computedHash: hash}, result)
              );
            }
            return false;
          }
          // Don't validate hash on subsequent calls to satisfies
          result.hash = undefined;
        }

        // If we're not given an array, we assume it's a set of parameters that
        // must be used to parameterize the original scopesets
        if (!(scopesets instanceof Array)) {
          var params = scopesets;
          scopesets = _.cloneDeep(entry.scopes, function(scope) {
            if(typeof(scope) === 'string') {
              return scope.replace(/<([^>]+)>/g, function(match, param) {
                var value = params[param];
                return value === undefined ? match : value;
              });
            }
          });
        }

        // Test that we have scope intersection, and hence, is authorized
        var retval = utils.scopeMatch(result.scopes, scopesets);
        if (!retval && !noReply) {
          res.reportError('InsufficientScopes', [
            "You do not have sufficient scopes. This request requires you",
            "to have one of the following sets of scopes:",
            "{{scopesets}}",
            "",
            "You only have the scopes:",
            "{{scopes}}",
            "",
            "In order words you are missing scopes from one of the options:"
          ].concat(scopesets.map((set, index) => {
            let missing = set.filter(scope => {
              return !utils.scopeMatch(result.scopes, [[scope]]);
            });
            return ' * Option ' + index + ':\n    - "' +
                   missing.join('", and\n    - "') + '"';
          })).join('\n'),  {scopesets, scopes: result.scopes});
        }
        return retval;
      };

      // If authentication is deferred or satisfied, then we proceed
      if (!entry.scopes || entry.deferAuth || req.satisfies(entry.scopes)) {
        next();
      }
    }).catch(function(err) {
      return res.reportInternalError(err);
    });
  };
};

/**
 * Handle API end-point request
 *
 * This invokes the handler with `context` as `this` and then catches
 * exceptions and failures of returned promises handler.
 */
var handle = function(handler, context) {
  assert(handler, "No handler is provided");
  return function(req, res) {
    Promise.resolve(null).then(function() {
      return handler.call(context, req, res);
    }).catch(function(err) {
      return res.reportInternalError(err);
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
 *   output:   'output-schema.json',             // optional, null if no output
 *   skipInputValidation:    true,               // defaults to false
 *   skipOutputValidation:   true,               // defaults to false
 *   title:     "My API Method",
 *   description: [
 *     "Description of method in markdown, enjoy"
 *   ].join('\n')
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
  ['method', 'route', 'title', 'description'].forEach(function(key) {
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
    utils.validateScopeSets(options.scopes);
  }
  options.handler = handler;
  if (options.input) {
    options.input = this._options.schemaPrefix + options.input;
  }
  if (options.output) {
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
 *   clientLoader:        function(clientId) {      // Return promise for client
 *   authBaseUrl:         'http://auth.example.net' // BaseUrl for auth server
 *   credentials: {               // Omit to use remote signature validation
 *     clientId:          '...',  // TaskCluster clientId
 *     accessToken:       '...'   // Access token for clientId
 *     // Client must have the 'auth:credentials' scope.
 *   },
 *   raven:               null,   // optional raven.Client for error reporting
 *   component:           'queue',      // Name of the component in stats
 *   drain:               new Influx()  // drain for statistics
 * }
 *
 * The option `validator` must provided, and either `credentials` or
 * `clientLoader` must be provided.
 *
 * Return an `express.Router` instance.
 */
API.prototype.router = function(options) {
  //assert(options.validator instanceof Validator,
  //       "API.router() needs a validator");
  // NOTE that instanceof Validator and similar calls will no longer work
  // in the split-tc-base world.
  assert(options.validator.constructor.name === 'Validator');
  debugger;
  ['check', 'load', 'register'].forEach(function(x) {
    assert(typeof options.validator.constructor.prototype[x] === 'function',
        'API.router() needs validator property with ' + x + ' function');
  });


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
    if (!options.clientLoader) {
      // Create clientLoader
      options.clientLoader = clientLoader(_.defaults({
        baseUrl:            options.authBaseUrl
      }, options.credentials));
      // Wrap in a clientCache
      options.clientLoader = clientCache(options.clientLoader);
    }
    // Replace auth strategy
    authStrategy = function(entry) {
      return authenticate(options.nonceManager, options.clientLoader, entry);
    };
  }

  // Create statistics reporter
  var reporter = null;
  if (options.drain) {
    assert(options.component, "The component must be named in statistics!");
    reporter = series.ResponseTimes.reporter(options.drain);
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
  this._entries.forEach(entry => {
    // Route pattern
    var middleware = [entry.route];

    // Statistics, if reporter is defined
    if (reporter) {
      middleware.push(stats.createResponseTimer(reporter, {
        method:     entry.name,
        component:  options.component
      }));
    }

    // Add authentication, schema validation and handler
    middleware.push(
      errors.BuildReportErrorMethod(
        entry.name, this._options.errorCodes, options.raven
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
      handle(entry.handler, options.context)
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
    entries: this._entries.map(function(entry) {
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

  // Create validator to validate schema
  var validator = new Validator();
  // Load api-reference.json schema from disk
  var schemaPath = path.join(__dirname, 'schemas', 'api-reference.json');
  var schema = fs.readFileSync(schemaPath, {encoding: 'utf-8'});
  validator.register(JSON.parse(schema));

  // Check against it
  var refSchema = 'http://schemas.taskcluster.net/base/v1/api-reference.json#';
  var errors = validator.check(reference, refSchema);
  if (errors) {
    debug("API.references(): Failed to validate against schema, errors: %j " +
          "reference: %j", errors, reference);
    debug("Reference:\n%s", JSON.stringify(reference, null, 2));
    debug("Errors:\n%s", JSON.stringify(errors, null, 2));
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
 * Setup API, by publishing reference and returning an `express.Router`.
 *
 * options:
 * {
 *   inputLimit:          '10mb'  // Max input JSON size
 *   allowedCORSOrigin:   '*'     // Allowed CORS origin, null to disable CORS
 *   context:             {}      // Object to be provided as `this` in handlers
 *   validator:           new base.validator()      // JSON schema validator
 *   nonceManager:        function(nonce, ts, cb) { // Check for replay attack
 *   clientLoader:        function(clientId) {      // Return promise for client
 *   authBaseUrl:         'http://auth.example.net' // BaseUrl for auth server
 *   credentials: {
 *     clientId:          '...',  // TaskCluster clientId
 *     accessToken:       '...'   // Access token for clientId
 *     // Client must have the 'auth:credentials' scope.
 *   },
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
 * The option `validator` must provided, and either `credentials` or
 * `clientLoader` must be provided.
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
API.authenticate  = authenticate;
API.schema        = schema;
API.handle        = handle;
API.stability     = stability;
API.createSignatureValidator = createSignatureValidator;
