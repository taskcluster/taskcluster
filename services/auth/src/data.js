var debug       = require('debug')('auth:data');
var Entity      = require('azure-entities');
var assert      = require('assert');
var _           = require('lodash');
var taskcluster = require('taskcluster-client');

var Client = Entity.configure({
  version:          1,
  partitionKey:     Entity.keys.StringKey('clientId'),
  rowKey:           Entity.keys.ConstantKey('client'),
  signEntities:     true,
  properties: {
    clientId:       Entity.types.String,
    description:    Entity.types.Text,
    accessToken:    Entity.types.EncryptedText,
    expires:        Entity.types.Date,
    details:        Entity.types.JSON
  },
  context:          ['resolver']
}).configure({
  version:          2,
  signEntities:     true,
  properties: {
    clientId:       Entity.types.String,
    description:    Entity.types.Text,
    accessToken:    Entity.types.EncryptedText,
    expires:        Entity.types.Date,
    /**
     * Details object with properties:
     * - created          // Time when client was created
     * - lastModified     // Last time client was modified
     * - lastDateUsed     // Only updated if more than 6 hours out of date
     * - lastRotated      // Last time accessToken was reset
     * (more properties may be added in the future)
     */
    details:        Entity.types.JSON,
    scopes:         Entity.types.JSON,  // new in v2
    disabled:       Entity.types.Number // new in v2
  },
  context:          ['resolver'],
  migrate(item) {
    item.scopes = [];
    item.disabled = 0;
    return item;
  }
});

/** Get scopes granted to this client */
Client.prototype.expandedScopes = function() {
  return this.resolver.resolve(this.scopes);
};

/** Get JSON representation of client */
Client.prototype.json = function() {
  return {
    clientId:       this.clientId,
    description:    this.description,
    expires:        this.expires.toJSON(),
    created:        this.details.created,
    lastModified:   this.details.lastModified,
    lastDateUsed:   this.details.lastDateUsed,
    lastRotated:    this.details.lastRotated,
    scopes:         this.scopes,
    expandedScopes: this.expandedScopes(),
    disabled:       !!this.disabled
  };
};

/**
 * Ensure root client exists and has the given accessToken.
 *
 * Should only be called if the app is configured with a rootAccessToken.
 * Otherwise, app should assume whatever is in the table storage is the
 * root access token, and that appropriate role is attached.
 */
Client.ensureRootClient = function(accessToken) {
  assert(typeof(accessToken) === 'string',
         "Expected accessToken to be a string");
  let Client = this;
  // Create client resolving conflicts by overwriting
  return Client.create({
    clientId:         'root',
    description:      "Automatically created `root` client with star scopes " +
                      "for bootstrapping API access",
    accessToken:      accessToken,
    expires:          taskcluster.fromNow('24 hours'),
    details: {
      created:        new Date().toJSON(),
      lastModified:   new Date().toJSON(),
      lastDateUsed:   new Date().toJSON(),
      lastRotated:    new Date().toJSON()
    },
    scopes:           ['*'],
    disabled:         0,
  }, true);
};

// Export Client
exports.Client = Client;

var Role = Entity.configure({
  version:          1,
  partitionKey:     Entity.keys.StringKey('roleId'),
  rowKey:           Entity.keys.ConstantKey('role'),
  signEntities:     true,
  properties: {
    roleId:         Entity.types.String,
    description:    Entity.types.Text,
    scopes:         Entity.types.JSON,
    /**
     * Details object with properties:
     * - created
     * - lastModified
     * (more properties may be added in the future)
     */
    details:        Entity.types.JSON,
  },
  context:          ['resolver']
});

/** Get JSON representation of a role */
Role.prototype.json = function() {
  let scopes = ['assume:' + this.roleId];
  if (this.roleId.endsWith('*')) {
    scopes = this.scopes;
  }
  return {
    roleId:         this.roleId,
    description:    this.description,
    created:        this.details.created,
    lastModified:   this.details.lastModified,
    scopes:         this.scopes,
    expandedScopes: this.resolver.resolve(scopes),
  };
};

// Export Role
exports.Role = Role;

