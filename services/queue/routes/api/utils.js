var nconf       = require('nconf');
var express     = require('express');
var debug       = require('debug')('routes:api:utils');
var validate    = require('../../utils/validate');

// This file contains a collection of neat middleware for building API
// end-points, that can mounted on an express application

/**
 * Declare {input, output} schemas as options to validate
 * This validates body against the schema given in `options.input` and returns
 * and a 400 error messages to request if there is a schema mismatch.
 * Handlers below this should output the reply JSON structure with `req.reply`.
 * this will validate it against `options.output` if provided.
 * Handlers may output errors using `req.json`, as `req.reply` will validate
 * against schema and always returns a 200 OK reply.
 */
var schema = function(options) {
  return function(req, res, next) {
    // If input schema is defined we need to validate the input
    if (options.input !== undefined) {
      var errors = validate(req.body, options.input);
      if (errors) {
        debug("Request payload for %s didn't follow schema",
              req.url, options.input, errors);
        res.json(400, {
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
      if(nconf.get('queue:validateOutgoing') &&
         options.output !== undefined) {
        try {
          var errors = validate(json, options.output);
          if (errors) {
            res.json(500, {
              'message':  "Internal Server Error",
            });
            debug("Reply for %s didn't match schema: %s got errors:\n%s",
                  req.url, options.output, JSON.stringify(errors, null, 4));
            return;
          }
        }
        catch(err) {
          debug("Schema validation caused an exception, schema: %s, input:",
                options.output, JSON.stringify(json, null, 4));
          res.json(500, {
            'message':  "Internal Server Error",
          });
          throw err;
        }
      }
      // If JSON was valid or validation was skipped then reply with 200 OK
      res.json(200, json);
    };

    // Call next piece of middleware, typically the handler...
    next();
  };
};
exports.schema = schema;

/** Create an API end-point */
var API = function(options) {
  this._options = options;
  this._entries = [];
};
exports.API = API;

/**
 * Declare an API end-point entry, where options is on the following form:
 *
 *      {
 *        method:   'post|head|put|get|delete',
 *        route:    '/my/express/route/:some_identifier',
 *        input:    'http://schemas...input-schema.json',   // optional
 *        output:   'http://schemas...output-schema.json',  // optional
 *        title:    "My API Method",
 *        desc:     "Description of method in markdown, enjoy"
 *      }
 *
 * The handler parameter is a normal connect/express request handler, it should
 * return JSON replies with `request.reply(json)` and errors with
 * `request.json(code, json)`, as `request.reply` may be validated against the
 * declared output schema.
 */
API.prototype.declare = function(options, handler) {
  // Check presence of require properties
  [
    'method', 'route', 'title', 'desc'
  ].forEach(function(prop) {
    if(options[prop] === undefined) {
      throw new Error("Can't declare API entry without " + prop);
    }
  });

  // Set handler on options
  options.handler = handler;

  // Append entry to entries
  this._entries.push(options);
};

/** Mount API under a given mountpoint (topically `/version`) */
API.prototype.mount = function(app, mountpoint) {
  // Create router that we can mount
  var router = new express.Router();
  this._entries.forEach(function(entry) {
    router[entry.method](entry.route, schema(entry), entry.handler);
  });

  // Add entry point to get documentation as JSON
  var that = this;
  router.get('/reference', function(req, res) {
    res.json(200, that._entries.map(function(entry) {
      return {
        method:         entry.method,
        route:          mountpoint + entry.route,
        requestSchema:  entry.input,
        responseSchema: entry.output,
        title:          entry.title,
        description:    entry.desc
      };
    }));
  });

  // Mount a JSON parser for the API
  app.use(mountpoint, express.json({
    limit:          this._options || '10mb'
  }));

  // Allow CORS requests to the API
  app.use(mountpoint, function(req, res, next) {
    res.header('Access-Control-Allow-Origin',   '*');
    res.header('Access-Control-Allow-Headers',  'X-Requested-With,Content-Type');
    next();
  });

  // Mount the router middleware for the API
  app.use(mountpoint, router.middleware);
};
