var debug       = require('debug')('auth:data');
var base        = require('taskcluster-base');
var assert      = require('assert');
var _           = require('lodash');
var taskcluster = require('taskcluster-client');

var Client = base.Entity.configure({
  version:          1,
  partitionKey:     base.Entity.keys.StringKey('clientId'),
  rowKey:           base.Entity.keys.ConstantKey('client'),
  signEntities:     true,
  properties: {
    clientId:       base.Entity.types.String,
    description:    base.Entity.types.Text,
    accessToken:    base.Entity.types.EncryptedText,
    expires:        base.Entity.types.Date,
    /**
     * Details object with properties:
     * - created          // Time when client was created
     * - lastModified     // Last time client was modified
     * - lastDateUsed     // Only updated if more than 6 hours out of date
     * - lastRotated      // Last time accessToken was reset
     * (more properties may be added in the future)
     */
    details:        base.Entity.types.JSON
  },
  context:          ['resolver']
});

/** Get scopes granted to this client */
Client.prototype.expandedScopes = function() {
  return this.resolver.resolve(['assume:client-id:' + this.clientId]);
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
    expandedScopes: this.expandedScopes()
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
    description:      "Automatically created `root` client " +
                      "for bootstrapping API access",
    accessToken:      accessToken,
    expires:          taskcluster.fromNow('24 hours'),
    details: {
      created:        new Date().toJSON(),
      lastModified:   new Date().toJSON(),
      lastDateUsed:   new Date().toJSON(),
      lastRotated:    new Date().toJSON()
    }
  }, true);
};

// Export Client
exports.Client = Client;

var Role = base.Entity.configure({
  version:          1,
  partitionKey:     base.Entity.keys.StringKey('roleId'),
  rowKey:           base.Entity.keys.ConstantKey('role'),
  signEntities:     true,
  properties: {
    roleId:         base.Entity.types.String,
    description:    base.Entity.types.Text,
    scopes:         base.Entity.types.JSON,
    /**
     * Details object with properties:
     * - created
     * - lastModified
     * (more properties may be added in the future)
     */
    details:        base.Entity.types.JSON,
  },
  context:          ['resolver']
});

/** Get JSON representation of a role */
Role.prototype.json = function() {
  return {
    roleId:         this.roleId,
    description:    this.description,
    created:        this.details.created,
    lastModified:   this.details.lastModified,
    scopes:         this.scopes,
    expandedScopes: this.resolver.resolve(['assume:' + this.roleId])
  };
};

/**
 * Ensure the role: client-id:root -> ['*'] exists
 *
 * Should only be called if the app is configured with a rootAccessToken.
 * Otherwise, app should assume whatever is in the table storage is the
 * root access token, and that appropriate role is attached.
 *
 * Basically, this is for bootstrapping only.
 */
Role.ensureRootRole = function() {
  let Role = this;
  return Role.create({
    roleId:       'client-id:root',
    description:  "Automatically created role for bootstrapping the `root` "+
                  "client.",
    scopes:       ['*'],
    details: {
      created:        new Date().toJSON(),
      lastModified:   new Date().toJSON()
    }
  }, true);
};

// Export Role
exports.Role = Role;

