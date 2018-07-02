let azure       = require('azure-storage');
let _           = require('lodash');
let debug       = require('debug')('app:blobstore');
let assert      = require('assert');
let querystring = require('querystring');

/**
 * Create convenient azure blob storage wrapper.
 * options:
 * {
 *   container:            // Container name to use
 *   credentials: {
 *     accountName:        // Azure storage account name
 *     accountKey:         // Azure storage account key
 *   }
 * }
 */
var BlobStore = function(options) {
  assert(options.container, 'Container name must be given');
  this.container = options.container;
  // Documentation for the BlobService object can be found here:
  // http://dl.windowsazure.com/nodestoragedocs/index.html
  this.service = azure.createBlobService(
    options.credentials.accountId,
    options.credentials.accountKey,
  ).withFilter(new azure.ExponentialRetryPolicyFilter());
};

// Export BlobStore
module.exports = BlobStore;

/** Create blob-store container */
BlobStore.prototype.createContainer = function() {
  return new Promise((accept, reject) => {
    this.service.createContainerIfNotExists(this.container, (err, created) => {
      if (err) {
        debug('Failed to create container \'%s\', err: %s, as JSON: %j',
          this.container, err, err);
        return reject(err);
      }
      if (created) {
        debug('Container \'%s\' created', this.container);
      } else {
        debug('Container \'%s\' already exists', this.container);
      }
      return accept(created);
    });
  });
};

/** Configure CORS on blob-store container */
BlobStore.prototype.setupCORS = function() {
  var that = this;
  return new Promise(function(accept, reject) {
    that.service.setServiceProperties({
      Cors: {
        CorsRule: [
          {
            AllowedOrigins:   ['*'],
            AllowedMethods:   ['GET'],
            AllowedHeaders:   [],
            ExposedHeaders:   ['content-length', 'content-type'],
            MaxAgeInSeconds:  60 * 5,
          },
        ],
      },
    }, function(err, response) {
      if (err) {
        debug('Failed to configure CORS, err: %s, JSON: %j', err, err);
        return reject(err);
      }
      return accept(response);
    });
  });
};

/** Put JSON object and overwrite existing blob */
BlobStore.prototype.put = function(key, json) {
  var that = this;
  return new Promise(function(accept, reject) {
    var payload = JSON.stringify(json);
    that.service.createBlockBlobFromText(that.container, key, payload, {
      contentSettings: {
        contentType:      'application/json',
      },
    }, function(err, result, response) {
      if (err) {
        return reject(err);
      }
      return accept(result);
    });
  });
};

/**
 * Put JSON object if it doesn't already exist
 *
 * Causes and error with `code` 'BlobAlreadyExists' if the blob already exists.
 */
BlobStore.prototype.putIfNotExists = function(key, json) {
  var that = this;
  return new Promise(function(accept, reject) {
    var payload = JSON.stringify(json);
    that.service.createBlockBlobFromText(that.container, key, payload, {
      contentSettings: {
        contentType:      'application/json',
      },
      accessConditions: {EtagNonMatch: '*'},
    }, function(err, result, response) {
      if (err) {
        return reject(err);
      }
      return accept(result);
    });
  });
};

/**
 * Put JSON check that it matches what is already there
 *
 * Causes an error, with `code` 'BlobAlreadyExists' if the blob already exists
 * and contains JSON which doesn't satisfy match what we're putting
 */
BlobStore.prototype.putOrMatch = function(key, json) {
  var that = this;
  return that.putIfNotExists(key, json).catch(function(err) {
    // Handle error if we're getting a warning that the blob already exists
    if (err.code != 'BlobAlreadyExists') {
      throw err;
    }
    return that.get(key).then(function(result) {
      if (!_.isEqual(json, result)) {
        throw err;
      }
    });
  });
};

/**
 * Load a blob as JSON, if it exists
 *
 * return null if it doesn't exists and `nullIfNotFound` is `true`.
 */
BlobStore.prototype.get = function(key, nullIfNotFound) {
  var that = this;
  return new Promise(function(accept, reject) {
    that.service.getBlobToText(that.container, key, function(err, result) {
      if (err) {
        if (nullIfNotFound && err.code === 'BlobNotFound') {
          return accept(null);
        }
        return reject(err);
      }
      return accept(JSON.parse(result));
    });
  });
};

/** Generated Shared-Access-Signature for writing to a blob */
BlobStore.prototype.generateWriteSAS = function(key, options) {
  assert(options,                         'Options are required');
  assert(options.expiry instanceof Date,  'options.expiry must be given');
  // Set start of the signature to 15 min in the past
  var start   = new Date();
  start.setMinutes(start.getMinutes() - 15);
  // Generate SAS
  var sas = this.service.generateSharedAccessSignature(this.container, key, {
    AccessPolicy: {
      Start:        start,
      Expiry:       options.expiry,
      Permissions:  azure.BlobUtilities.SharedAccessPermissions.WRITE,
    },
  });

  return this.service.getUrl(this.container, key, sas);
};

/** Create signed GET url */
BlobStore.prototype.createSignedGetUrl = function(key, options) {
  assert(options,                         'Options are required');
  assert(options.expiry instanceof Date,  'options.expiry must be given');
  // Set start of the signature to 15 min in the past
  var start   = new Date();
  start.setMinutes(start.getMinutes() - 15);
  // Generate SAS
  var sas = this.service.generateSharedAccessSignature(this.container, key, {
    AccessPolicy: {
      Start:        start,
      Expiry:       options.expiry,
      Permissions:  azure.BlobUtilities.SharedAccessPermissions.READ,
    },
  });

  // Generate URL
  return this.service.getUrl(this.container, key, sas);
};

/** Delete a blob on azure blob storage */
BlobStore.prototype.deleteBlob = function(key, ignoreIfNotExists) {
  var that = this;
  return new Promise(function(accept, reject) {
    that.service.deleteBlob(that.container, key, function(err, result) {
      if (err) {
        if (!ignoreIfNotExists || err.code !== 'BlobNotFound') {
          return reject(err);
        }
      }
      return accept();
    });
  });
};
