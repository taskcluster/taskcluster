/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Load superagent-hawk
require('superagent-hawk')(require('superagent'));

var request     = require('superagent-promise');
var debug       = require('debug')('taskcluster-client');
var _           = require('lodash');
var assert      = require('assert');

// Default options stored globally for convenience
var _defaultOptions = {};

/**
 * Create a client class from a JSON reference.
 *
 * Returns a Client class which can be initialized with following options:
 * options:
 * {
 *   credentials: {
 *     clientId:     '...',        // ClientId
 *     accessToken:  '...',        // AccessToken for clientId
 *     delegating: true || false,  // Is delegating authentication?
 *     scopes:     ['scopes', ...] // Scopes to authorize with
 *   }
 *   baseUrl:    'http://.../v1'  // baseUrl for API requests
 *   exchangePrefix:  'queue/v1/' // exchangePrefix prefix
 * }
 *
 * `baseUrl` and `exchangePrefix` defaults to values from reference.
 */
exports.createClient = function(reference) {
  // Client class constructor
  var Client = function(options) {
    this._options = _.defaults(options || {}, {
      baseUrl:          reference.baseUrl        || '',
      exchangePrefix:   reference.exchangePrefix || ''
    }, _defaultOptions);
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
        endpoint = endpoint.replace('<' + arg + '>', args.shift() || '');
      });
      // Create request
      var req = request[entry.method](this._options.baseUrl + endpoint);
      // Add payload if one is given
      if (entry.input) {
        req.send(args.pop());
      }
      // Authenticate, if credentials are provided
      if (this._options.credentials) {
        var extra = {};
        // if delegating scopes, provide the scopes set to delegate
        if (this._options.credentials.delegating) {
          assert(this._options.credentials.scopes,
                 "Can't delegate without scopes to delegate");
          extra.ext = new Buffer(JSON.stringify({
            delegating:       true,
            scopes:           this._options.credentials.scopes
          })).toString('base64');
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
          debug("Error calling: " + entry.name, res.body);
          var message = "Unknown Server Error";
          if (res.status === 401) {
            message = "Authentication Error";
          }
          if (res.status === 500) {
            message = "Internal Server Error";
          }
          err = new Error(res.body.message || message);
          err.body = res.body;
          throw err
        }
        debug("Success calling: " + entry.name);
        return res.body;
      });
    };
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
          var value = routingKeyPattern[key.name];
          if (typeof(value) === 'string') {
            assert(key.multipleWords || value.indexOf('.') === -1,
                   "routingKey pattern '" + value + "' for " + key.name +
                   " cannot contain dots as it does not hold multiple words");
            return value;
          } else {
            assert(value === null || value === undefined,
                  "Value: '" + value + "' is not supported as routingKey "+
                  "pattern for " + key.name);
            return key.multipleWords ? '#' : '*';
          }
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

  // Return client class
  return Client;
};


// Load data from apis.json
(function() {
  var fs   = require('fs');
  var path = require('path');
  var data = fs.readFileSync(path.join(__dirname, 'apis.json'), {
    encoding: 'utf-8'
  });
  var apis = JSON.parse(data);

  // Instantiate clients
  _.forIn(apis, function(api, name) {
    exports[name] = exports.createClient(api.reference);
  });
})();


/**
 * Update default configuration
 *
 * Example: `Client.config({credentials: {...}});`
 */
exports.config = function(options) {
  _defaultOptions = _.defaults(options, _defaultOptions);
};

// Export listener
exports.Listener = require('./listener');