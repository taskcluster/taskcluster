const _ = require('lodash');
const assert = require('assert');
const {DataContainer, DataBlockBlob} = require('azure-blob-storage');

/**
 * Roles stores exactly one blob that contains all of the defined roles.  This
 * is for purposes of serializing updates to the roles. Without this protection,
 * two overlapping modifications could produce a set of roles that contains a cycle,
 * crashing the Auth service.
 */
class Roles {
  constructor({credentials, containerName}) {
    this.credentials = credentials;
    this.containerName = containerName;
  }

  async setup() {
    this.container = new DataContainer({
      containerName: this.containerName,
      credentials: this.credentials,
      schema: {
        $schema: 'http://json-schema.org/draft-06/schema#',
        title: 'Roles',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            roleId: {
              type: 'string',
              pattern: '^[\\x20-\\x7e]+$',
            },
            scopes: {
              type: 'array',
              items: {
                type: 'string',
                pattern: '^[\x20-\x7e]*$',
              },
            },
            description: {
              type: 'string',
              maxLength: 1024*10,
            },
            lastModified: {
              type: 'string',
              format: 'date-time',
            },
            created: {
              type: 'string',
              format: 'date-time',
            },
          },
          additionalProperties: false,
          required: ['roleId', 'scopes', 'description', 'lastModified', 'created'],
        },
      },
    });

    await this.container.init();

    this.blob = new DataBlockBlob({
      container: this.container,
      name: 'Roles',
    });
  }

  async get() {
    try {
      return await this.blob.load();
    } catch (e) {
      if (e.code !== 'BlobNotFound') {
        throw e;
      }
      return [];
    }
  }

  /**
   * Update the roles, given a modifier function.  The modification is serialized with
   * any other modifications.  The modifier may be called multiple times.  This function
   * takes care of initializing the set of roles to [] before beginning.
   */
  async modify(modifier) {
    try {
      await this.blob.modify(modifier);
    } catch (e) {
      if (e.code !== 'BlobNotFound') {
        throw e;
      }

      // try to create the blob and update it again
      await this._create();
      return await this.modify(modifier);
    }
  }

  async _create() {
    try {
      // only create if the blob does not already exist..
      return await this.blob.create([], {ifNoneMatch: '*'});
    } catch (e) {
      if (e.code !== 'BlobAlreadyExists') {
        throw e;
      }
      // fall through - the blob exists, which is what we wanted
    }
  }
};

exports.Roles = Roles;
