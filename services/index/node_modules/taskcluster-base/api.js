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
var Validator     = require('./validator').Validator;
var utils         = require('./utils');
var stats         = require('./stats');
var crypto        = require('crypto');
var hoek          = require('hoek');

/** Structure for response times series */
var ResponseTimes = new stats.Series({
  name:                 'ResponseTimes',
  columns: {
    duration:           stats.types.Number,
    statusCode:         stats.types.Number,
    requestMethod:      stats.types.String,
    method:             stats.types.String,
    component:          stats.types.String
  },
  // Additional columns are req.params prefixed with "param", these should all
  // be strings
  additionalColumns:    stats.types.String
});


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
 * this will validate it against `options.output` if provided.
 * Handlers may output errors using `req.json`, as `req.reply` will validate
 * against schema and always returns a 200 OK reply.
 */
var schema = function(validator, options) {
  return function(req, res, next) {
    // If input schema is defined we need to validate the input
    if (options.input !== undefined && !options.skipInputValidation) {
      var errors = validator.check(req.body, options.input);
      if (errors) {
        debug("Request payload for %s didn't follow schema %s",
              req.url, options.input);
        res.status(400).json({
          'message':  "Request payload must follow the schema: " + options.input,
          'error':    errors
        });
        return;
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
          res.status(500).json({
            'message':  "Internal Server Error",
          });
          debug("Reply for %s didn't match schema: %s got errors:\n%s",
                req.url, options.output, JSON.stringify(errors, null, 4));
          return;
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
    if (cert.scopes.some(function(scope) {
      return typeof(scope) !== 'string';
    })) {
      throw new Error("ext.certificate.scopes must be an array of strings");
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
      throw new Error("ext.certificate issuer doesn't have sufficient scopes");
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
    if (typeof(cert.signature) !== 'string' || cert.signature !== signature) {
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
 * Handle API end-point request
 *
 * This invokes the handler with `context` as `this` and then catches
 * exceptions and failures of returned promises handler.
 */
var handle = function(handler, context) {
  assert(handler, "No handler is provided");
  return function(req, res) {
    Promise.from().then(function() {
      return handler.call(context, req, res);
    }).catch(function(err) {
      var incidentId = uuid.v4();
      debug(
        "Error occurred handling: %s, err: %s, as JSON: %j, incidentId: %s",
        req.url, err, err, incidentId, err.stack
      );
      res.status(500).json({
        message:        "Internal Server Error",
        error: {
          info:         "Ask administrator to lookup incidentId in log-file",
          incidentId:   incidentId
        }
      });
    });
  };
};

/**
 * Create an API builder
 *
 * options:
 * {
 *   title:         "API Title",
 *   description:   "API description in markdown"
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
  this._options = options;
  this._entries = [];
};

/**
 * Declare an API end-point entry, where options is on the following form:
 *
 * {
 *   method:   'post|head|put|get|delete',
 *   route:    '/object/:id/action/:parameter',        // Only on illustrated form
 *   name:     'identifierForLibraries',               // identifier used by client libraries
 *   scopes:   ['admin', 'superuser'],                 // Scopes of which user must have one
 *   input:    'http://schemas...input-schema.json',   // optional, null if no input
 *   output:   'http://schemas...output-schema.json',  // optional, null if no output
 *   skipInputValidation:    true,                     // defaults to false
 *   skipOutputValidation:   true,                     // defaults to false
 *   title:    "My API Method",
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
  options.handler = handler;
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
 *   credentials: {
 *     clientId:          '...',  // TaskCluster clientId
 *     accessToken:       '...'   // Access token for clientId
 *     // Client must have the 'auth:credentials' scope.
 *   },
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
  assert(options.validator instanceof Validator,
         "API.router() needs a validator");

  // Provide default options
  options = _.defaults({}, options, {
    inputLimit:           '10mb',
    allowedCORSOrigin:    '*',
    context:              {},
    nonceManager:         nonceManager()
  });

  // Create clientLoader, if not provided
  if (!options.clientLoader) {
    assert(options.credentials, "Either credentials or clientLoader is required");
    // Create clientLoader
    options.clientLoader = clientLoader(_.defaults({
      baseUrl:            options.authBaseUrl
    }, options.credentials));
    // Wrap in a clientCache
    options.clientLoader = clientCache(options.clientLoader);
  }

  // Create statistics reporter
  var reporter = null;
  if (options.drain) {
    assert(options.component, "The component must be named in statistics!");
    reporter = ResponseTimes.reporter(options.drain);
  }

  // Create router
  var router = express.Router();

  // Use JSON middleware
  router.use(bodyParser.json({
    limit:                options.inputLimit
  }));

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
  this._entries.forEach(function(entry) {
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
      authenticate(options.nonceManager, options.clientLoader, entry),
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
 *   baseUrl:    'https://example.com/v1' // URL under which routes are mounted
 * }
 */
API.prototype.reference = function(options) {
  assert(options,         "Options is required");
  assert(options.baseUrl, "A 'baseUrl' must be provided");
  var reference = {
    version:            '0.2.0',
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
      var regexp  = /\/:(\w+)(\(.*?\))?/g;
      var route   = entry.route.replace(regexp, function(match, param) {
        params.push(param);
        return '/<' + param + '>';
      });
      var retval = {
        type:           'function',
        method:         entry.method,
        route:          route,
        args:           params,
        name:           entry.name,
        title:          entry.title,
        description:    entry.description
      };
      if (entry.scopes) {
        retval.scopes = utils.normalizeScopeSets(entry.scopes);
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
 *   baseUrl:         'https://example.com/v1' // URL under which routes are mounted
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
  return Promise.from().then(function() {
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
