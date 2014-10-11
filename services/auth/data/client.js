var debug   = require('debug')('taskcluster-auth:data:client');
var base    = require('taskcluster-base');
var assert  = require('assert');

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

/**
 * Create client with root credentials
 *
 * The root client is hardcoded into the configuration and is used to create
 * other users. Technically, it's possible to modify the root user, but all
 * changes will be forgotten as we reset whenever the server starts.
 *
 * credentials: {
 *   clientId:        '...',
 *   accessToken:     '...'
 * }
 */
Client.createRootClient = function(credentials) {
  assert(credentials.clientId,    "root credentials must have clientId");
  assert(credentials.accessToken, "root credentials must have accessToken");
  var values = {
    version:      '0.2.0',
    clientId:     credentials.clientId,
    accessToken:  credentials.accessToken,
    scopes:       ['*'],
    expires:      new Date(3000, 0, 1), // 1st of January year 3000
    name:         "Root Client",
    details: {
      notes: [
        "This is the initial user that is **hardcoded** into the configuration",
        "of auth.taskcluster.net. Note, that these credentials should only be",
        "used to create the other taskcluster credentials.",
        "",
        "**Do not modify** this user, all changes will be reset whenever the",
        "server process restarts (this is often)."
      ].join('\n')
    }
  };
  // Load root client (if it exists)
  var Client = this;
  return Client.load(credentials.clientId).then(function(client) {
    // If it exists we make sure to modify it (reset any changes)
    return client.modify(function() {
      this.accessToken  = values.accessToken;
      this.scopes       = values.scopes;
      this.expires      = values.expires;
      this.name         = values.name;
      this.details      = values.details;
    });
  }, function(err) {
    // if it doesn't exist then we'll try to create it
    if (err.code === 'ResourceNotFound') {
      return Client.create(values).then(undefined, function(err) {
        // If it already exists, then we've been racing with another process
        // to create it, so we'll just modify it, I realize that we've been
        // doing this... but it makes sense to always assume it exist initially
        // as this will be the typical case. And then it makes sense to ensure
        // against the case were we're racing...
        if (err.code === 'EntityAlreadyExists') {
          return Client.load(credentials.clientId).then(function(client) {
            // If it exists we make sure to modify it (reset any changes)
            return client.modify(function() {
              this.accessToken  = values.accessToken;
              this.scopes       = values.scopes;
              this.expires      = values.expires;
              this.name         = values.name;
              this.details      = values.details;
            });
          });
        }
        throw err;
      });
    }
    throw err;
  }).then(function() {
    debug("Created root credentials");
  }, function(err) {
    debug("Failed to create root credentials, err: %s, json: %j", err, err);
    throw err;
  });
};

// Export client
module.exports = Client;
