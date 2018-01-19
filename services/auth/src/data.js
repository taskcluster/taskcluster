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
    details:        Entity.types.JSON,
  },
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
    disabled:       Entity.types.Number, // new in v2
  },
  migrate(item) {
    item.scopes = [];
    item.disabled = 0;
    return item;
  },
}).configure({
  version:          3,
  signEntities:     true,
  properties: {
    clientId:       Entity.types.String,
    description:    Entity.types.Text,
    accessToken:    Entity.types.EncryptedText,
    expires:        Entity.types.Date,
    /**
     * Details object with properties:
     * - created            // Time when client was created
     * - lastModified       // Last time client was modified
     * - lastDateUsed       // Only updated if more than 6 hours out of date
     * - lastRotated        // Last time accessToken was reset
     * - deleteOnExpiration // if true, can be deleted after expiration
     *                      // (new in v3)
     * (more properties may be added in the future)
     */
    details:        Entity.types.Schema({
      type: 'object',
      properties: {
        created:            {type: 'string', format: 'date-time'},
        lastModified:       {type: 'string', format: 'date-time'},
        lastDateUsed:       {type: 'string', format: 'date-time'},
        lastRotated:        {type: 'string', format: 'date-time'},
        deleteOnExpiration: {type: 'boolean'},
      },
      required: [
        'created', 'lastModified', 'lastDateUsed', 'lastRotated',
        'deleteOnExpiration',
      ],
    }),
    scopes:         Entity.types.JSON,
    disabled:       Entity.types.Number,
  },
  migrate(item) {
    item.details = _.defaults({}, item.details, {deleteOnExpiration: false});
    return item;
  },
});

/** Get scopes granted to this client */
Client.prototype.expandedScopes = function(resolver) {
  return resolver.resolve(this.scopes);
};

/** Get JSON representation of client */
Client.prototype.json = function(resolver) {
  return {
    clientId:           this.clientId,
    description:        this.description,
    expires:            this.expires.toJSON(),
    created:            this.details.created,
    lastModified:       this.details.lastModified,
    lastDateUsed:       this.details.lastDateUsed,
    lastRotated:        this.details.lastRotated,
    deleteOnExpiration: this.details.deleteOnExpiration,
    scopes:             this.scopes,
    expandedScopes:     this.expandedScopes(resolver),
    disabled:           !!this.disabled,
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
  assert(typeof accessToken === 'string',
    'Expected accessToken to be a string');
  // Create client resolving conflicts by overwriting
  return this.create({
    clientId:         'root',
    description:      'Automatically created `root` client with star scopes ' +
                      'for bootstrapping API access',
    accessToken:      accessToken,
    expires:          taskcluster.fromNow('24 hours'),
    details: {
      created:        new Date().toJSON(),
      lastModified:   new Date().toJSON(),
      lastDateUsed:   new Date().toJSON(),
      lastRotated:    new Date().toJSON(),
      deleteOnExpiration: false,
    },
    scopes:           ['*'],
    disabled:         0,
  }, true);
};

/**
 * Delete all clients that expired before `now`, unless
 * details.deleteOnExpiration is false.
 */

Client.purgeExpired = async function(now = new Date()) {
  var count = 0;
  var expired = await this.scan({
    expires: Entity.op.lessThan(now),
  }, {
    limit: 100,
    handler: async client => {
      if (client.details.deleteOnExpiration) {
        count++;
        await client.remove(true);
      }
    },
  });

  return count;
};

// Export Client
exports.Client = Client;
