var debug       = require('debug')('auth:client-loader');
var base        = require('taskcluster-base');
var Client      = require('../../auth/data').Client;

/** Load client from azure table storage */
var clientLoader = function(clientId) {
  return Client.load(clientId).then(function(client) {
    return new base.API.authenticate.Client({
      clientId:       client.clientId,
      accessToken:    client.accessToken,
      scopes:         client.scopes,
      expires:        client.expires
    });
  }).catch(function(err) {
    debug('Failed to load client: ' + clientId);
    throw err;
  });
};

// Export clientLoader
module.exports = clientLoader;
