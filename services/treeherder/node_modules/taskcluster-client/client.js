/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var request     = require('superagent-promise');
var debug       = require('debug')('taskcluster-client');
var _           = require('lodash');
var Promise     = require('promise');

/** Construct a client given a base URL and JSON API reference. */
var Client = function(baseUrl, reference) {
  this._baseUrl = baseUrl;
  var that = this;
  // For each API entry in the reference
  reference.forEach(function(entry) {
    // Find number of parameters
    var nb_params = (entry.route.match(/\/:[^/]+/g) || []).length;
    // Check if it has a payload
    var has_payload = (entry.requestSchema != undefined);
    if (has_payload) {
      nb_params += 1;
    }
    // Add method for API entry
    that[entry.name] = function() {
      debug("Calling: " + entry.name);
      // Convert arguments to actual array
      var args = Array.prototype.slice.call(arguments);
      // Validate number of arguments
      if (args.length != nb_params) {
        throw new Error("Function " + entry.name + " takes " + nb_params +
                        "arguments, but was given " + args.length +
                        " arguments");
      }
      // Substitute parameters into route
      var endpoint = entry.route.replace(/\/:[^/]+/g, function() {
        return '/' + (args.shift() || '');
      });
      // Create request
      var req = request[entry.method](that._baseUrl + endpoint);
      // Add payload if one is given
      if (has_payload) {
        req.send(args.pop());
      }
      // Send request and handle response
      return req.end().then(function(res) {
        if (!res.ok) {
          debug("Error calling: " + entry.name, res.body);
          throw new Error(res.body);
        }
        debug("Success calling: " + entry.name);
        return res.body;
      });
    };
  });
};

/**
 * Create client given a baseUrl and version (defaults to 1)
 * Return a promise for the client instance.
 */
Client.load = function(baseUrl, version) {
  if (version === undefined) {
    version = 1;
  }
  return request
          .get(baseUrl + '/v' + version + '/reference')
          .end()
          .then(function(res) {
            if (!res.ok) {
              throw new Error(res.text);
            }
            return new Client(baseUrl, res.body);
          });
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
    Client[name] = new Client(api.baseUrl, api.reference);
  });
})();


/**
 * Update default baseUrls
 *
 * Example: `Client.config({queue: 'http://localhost:3001'});`
 */
Client.config = function(baseUrlMapping) {
  _.forIn(baseUrlMapping, function(baseUrl, name) {
    if (!(Client[name] instanceof Client)) {
      throw new Error("Can't set baseUrl for " + name + ", no such API!");
    }
    Client[name]._baseUrl = baseUrl;
  });
};

// Export client
module.exports = Client;
