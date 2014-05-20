var debug = require('debug')('taskcluster-auth:data:client');
var base  = require('taskcluster-base');

/** Configure a client Entity subclass */
var Client = base.Entity.configure({
  mapping: [
    {
      key:              'PartitionKey',
      property:         'clientId',
      type:             'string'
    }, {
      // This is always hardcoded to 'credentials'
      key:              'RowKey',
      type:             'string',
      hidden:           true
    }, {
      key:              'accessToken',
      type:             'string'
    }, {
      key:              'name',
      type:             'string'
    }, {
      key:              'version',
      type:             'string'
    }, {
      key:              'scopes',
      type:             'json'
    }, {
      key:              'expires',
      type:             'date'
    }, {
      key:              'details',
      type:             'json'
    }
  ]
});

// RowKey constant, used as we don't need a RowKey
var ROW_KEY_CONST = 'credentials';

/** Create a client */
Client.create = function(properties) {
  properties.RowKey = ROW_KEY_CONST;
  return base.Entity.create.call(this, properties);
};

/** Load client from clientId */
Client.load = function(clientId) {
  return base.Entity.load.call(this, clientId, ROW_KEY_CONST);
};

/** Load all clients */
Client.loadAll = function() {
  return base.Entity.queryRowKey.call(this, ROW_KEY_CONST);
};

/** Remove client with given clientId */
Client.remove = function(clientId) {
  return base.Entity.remove.call(this, clientId, ROW_KEY_CONST);
};

/** Create a clientLoader that can be used with base.API instances */
Client.createClientLoader = function() {
  var Class = this;
  return function(clientId) {
    return Class.load(clientId).then(function(client) {
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
};


// Export client
module.exports = Client;