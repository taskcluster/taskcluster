'use strict';

var request = require('request');
var url = require('url');
var querystring = require('querystring');

var versionInfo = require('../package.json').version;
var utils = require('./utils');
var Batch = require('./batch').Batch;

// A trick with callbacks. Batch elements are not using own callback
// but provide one that is directly returning what was provided as parameters.
// This way we can use the normal callback parsers, but all cb() commands have to
// use return in call!
function batchCallback(err, data) {
  return {err: err, data: data};
}



var Client = {
  // settings object, cannot be edited
  _settings: null,
  // request object with defaults for this client
  _request: null,
  // decoded azure key
  _azureKey: null,
  // decoded sas
  _sas: null,
  // retry function
  _retryLogic: null,

  _prepareRequestDefaults: function(settings) {
    var defaults = {
      encoding: 'utf8',
      timeout: settings.timeout
    };
    if (settings.agent) {
      defaults.agent = settings.agent;
    }
    if (settings.proxy) {
      defaults.proxy = settings.proxy;
    }
    if (settings.forever === true) {
      defaults.forever = settings.forever;
    }
    if (settings.agentOptions) {
      defaults.agentOptions = settings.agentOptions;
    }
    if (settings.pool != null) {
      defaults.pool = settings.pool;
    }
    return defaults;
  },

  _getRequestSpecificOptions: function _getRequestSpecificOptions(method, path, qs) {
    var now = new Date().toUTCString();

    var requestOptions = {
      method: method,
      uri: url.parse(this._settings.accountUrl + path),
      qs: qs,
      headers: {
        accept: 'application/json;odata='+this._settings.metadata+'metadata',
        DataServiceVersion: '3.0;NetFx',
        date: now,
        'user-agent': 'azure-table-node/'+versionInfo,
        'x-ms-date': now,
        'x-ms-version': '2013-08-15'
      }
    };

    // json key will add it, but we need it for signing header computation
    if (method !== 'GET' && method !== 'DELETE') {
      requestOptions.headers['content-type'] = 'application/json';
    }

    return requestOptions;
  },

  _addSharedKeyAuthHeader: function _addSharedKeyAuthHeader(requestOptions) {
    var stringToSign = requestOptions.method +'\n';
    stringToSign += (requestOptions.headers['content-md5'] ? requestOptions.headers['content-md5'] : '') + '\n';
    stringToSign += (requestOptions.headers['content-type'] ? requestOptions.headers['content-type'] : '') + '\n';
    stringToSign += (requestOptions.headers['x-ms-date'] ? requestOptions.headers['x-ms-date'] : '') + '\n';
    stringToSign += '/'+this._settings.accountName;
    stringToSign += requestOptions.uri.path;
    if (requestOptions.qs && 'comp' in requestOptions.qs) {
      stringToSign += '?comp=' + requestOptions.qs.comp;
    }

    requestOptions.headers.authorization = 'SharedKey ' + this._settings.accountName + ':' + utils.hmacSha256(this._azureKey, stringToSign);
    return requestOptions;
  },

  _addSAS: function _addSAS(options) {
    if (options.qs) {
      for (var k in this._sas) {
        if (this._sas.hasOwnProperty(k)) {
          options.qs[k] = this._sas[k];
        }
      }
    } else { // if not set, we can just put it without copying
      options.qs = this._sas;
    }
    return options;
  },

  _normalizeCallback: function _normalizeCallback(cb, error, response, body) {
    if (error) {
      return cb(error);
    }
    if (!response) {
      return cb({code: 'UnknownError'});
    }
    // try to parse to JSON if it looks like JSON but is not object yet
    //console.log('BODY', body);
    if (body && typeof body === 'string' && (body[0] === '{' || body[0] === '[')) {
      try {
        body = JSON.parse(body);
      } catch (e) {}
    }
    if (response.statusCode >= 400) {
      return cb({
        statusCode: response.statusCode,
        code: body && body['odata.error'] ? body['odata.error'].code : 'UnknownBody',
        body: body && body['odata.error'] ? body['odata.error'] : body
      });
    }
    return cb(null, {
      statusCode: response.statusCode,
      headers: response.headers, // continuations are in response headers
      body: body
    });
  },

  _sendRequestWithRetry: function _sendRequestWithRetry(options, cb) {
    if (this._retryLogic == null) {
      this._request(options, this._normalizeCallback.bind(this, cb));
    } else {
      var self = this;
      this._retryLogic(options, function(filterCb) {
        self._request(options, self._normalizeCallback.bind(self, function(err, resp) {
          filterCb(err, resp, function(err, resp) {
            cb(err, resp);
          });
        }));
      });
    }
  },

  _makeRequest: function _makeRequest(method, path, qs, body, filter, cb) {
    if (cb == null) {
      cb = filter;
    }
    var options = this._getRequestSpecificOptions(method, path, qs);
    if (this._azureKey) {
      options = this._addSharedKeyAuthHeader(options);
    }

    if (typeof body === 'object') {
      options.json = body;
    }

    if (cb !== filter && filter != null) {
      options = filter.call(this, options);
    }

    if (!this._azureKey && this._sas) {
      options = this._addSAS(options);
    }

    this._sendRequestWithRetry(options, cb);
  },

  _preferNoContentFilter: function _insertEntityFilter(options) {
    options.headers.prefer = 'return-no-content';
    return options;
  },

  _matchIfAsteriskFilter: function _matchIfAsteriskFilter(options) {
    options.headers['if-match'] = '*';
    return options;
  },

  _forceFullMetadata: function _forceFullMetadata(options) {
    options.headers.accept = 'application/json;odata=fullmetadata';
    return options;
  },

  create: function create(settings) {
    if (!settings.accountUrl || !settings.accountName || !(settings.accountKey || settings.sas)) {
      throw 'Provide accountUrl, accountName, and accountKey (or sas) in settings or in env CLOUD_STORAGE_ACCOUNT';
    }

    var sealedSettings = Object.seal(settings);

    // create request object with most of the default settings
    var defaultRequest = request.defaults(this._prepareRequestDefaults(sealedSettings));

    var retryLogic;
    if (typeof sealedSettings.retry === 'function') {
      retryLogic = sealedSettings.retry;
    } else if (typeof sealedSettings.retry === 'object') {
      retryLogic = utils.generateRetryFunction(sealedSettings.retry);
    } else if (sealedSettings.retry === false) {
      retryLogic = null;
    } else {
      retryLogic = utils.generateRetryFunction();
    }

    return Object.create(this, {
      _settings: {value: sealedSettings},
      _request: {value: defaultRequest},
      _azureKey: {value: sealedSettings.accountKey ? utils.base64Decode(sealedSettings.accountKey) : null},
      _sas: {value: sealedSettings.sas ? querystring.parse(sealedSettings.sas) : null},
      _retryLogic: {value: retryLogic}
    });
  },

  getSettings: function getSettings() {
    return this._settings;
  },

  _createTableCb: function _createTableCb(cb, options, err, data) {
    if (!err && (data.statusCode === 201 || data.statusCode === 204)) {
      return cb(null);
    } else if (options && options.ignoreIfExists === true && err && err.code === 'TableAlreadyExists') {
      return cb(null);
    } else {
      return cb(err);
    }
  },
  createTable: function createTable(table, options, cb) {
    if (typeof options === 'function') {
      cb = options;
    } else if (cb == null) {
      cb = batchCallback;
    }
    this._makeRequest('POST', 'Tables', null, {TableName:table}, this._preferNoContentFilter, this._createTableCb.bind(this, cb, typeof options === 'object' ? options : null));
    return this;
  },

  _deleteTableCb: function _deleteTableCb(cb, err, data) {
    if (!err && data.statusCode === 204) {
      return cb(null);
    } else {
      return cb(err);
    }
  },
  deleteTable: function deleteTable(table, cb) {
    if (cb == null) {
      cb = batchCallback;
    }
    this._makeRequest('DELETE', 'Tables(\''+table+'\')', null, null, this._deleteTableCb.bind(this, cb));
    return this;
  },

  _listTablesCb: function _listTablesCb(cb, err, data) {
    if (!err && data.statusCode === 200) {
      var results = new Array(data.body.value.length);
      data.body.value.forEach(function(r, i) {
        this[i] = r.TableName;
      }, results);
      var continuation = data.headers['x-ms-continuation-nexttablename'];
      return cb(null, results, continuation);
    } else {
      return cb(err);
    }
  },
  listTables: function listTables(options, cb){
    if (typeof options === 'function') {
      cb = options;
    } else if (cb == null) {
      cb = batchCallback;
    }
    var qs = null;
    if (typeof options === 'object' && options.nextTableName) {
      qs = {
        NextTableName: options.nextTableName
      };
    }

    this._makeRequest('GET', 'Tables', qs, null, this._listTablesCb.bind(this, cb));
    return this;
  },

  _insertEntityCb: function _insertEntityCb(cb, options, err, data) {
    if (!err) {
      if (data.statusCode === 204) {
        return cb(null, data.headers.etag);
      } else { // data.statusCode === 201
        var entity = utils.deserializeEntity(data.body);
        entity.__etag = data.headers.etag;
        return cb(null, entity);
      }
    } else {
      return cb(err);
    }
  },
  insertEntity: function insertEntity(table, entity, options, cb) {
    if (!entity || typeof entity.PartitionKey !== 'string' || typeof entity.RowKey !== 'string') {
      throw 'PartitionKey and RowKey in entity are required';
    }
    if (typeof options === 'function') {
      cb = options;
    } else if (cb == null) {
      cb = batchCallback;
    }

    var filter = null;
    if (!(typeof options === 'object' && options.returnEntity === true)) {
      filter = this._preferNoContentFilter;
    }

    this._makeRequest('POST', table, null, utils.serializeEntity(entity), filter, this._insertEntityCb.bind(this, cb, options));
    return this;
  },

  _204Cb: function _204Cb(cb, err, data) {
    if (!err && data.statusCode === 204) {
      return cb(null, data.headers.etag);
    } else {
      return cb(err);
    }
  },
  _insertWithReplaceOrMerge: function _insertWithReplaceOrMerge(method, table, entity, cb) {
    if (!entity || typeof entity.PartitionKey !== 'string' || typeof entity.RowKey !== 'string') {
      throw 'PartitionKey and RowKey in entity are required';
    }
    if (cb == null) {
      cb = batchCallback;
    }

    this._makeRequest(method, utils.prepareEntityPath(table, entity.PartitionKey, entity.RowKey), null, utils.serializeEntity(entity), this._204Cb.bind(this, cb));
    return this;
  },

  insertOrReplaceEntity: function insertOrReplaceEntity(table, entity, cb) {
    return this._insertWithReplaceOrMerge('PUT', table, entity, cb);
  },

  insertOrMergeEntity: function insertOrMergeEntity(table, entity, cb) {
    return this._insertWithReplaceOrMerge('MERGE', table, entity, cb);
  },

  _updateMergeEntity: function _updateMergeEntity(method, table, entity, options, cb) {
    if (!entity || typeof entity.PartitionKey !== 'string' || typeof entity.RowKey !== 'string') {
      throw 'PartitionKey and RowKey in entity are required';
    }
    if (typeof options === 'function') {
      cb = options;
    } else if (cb == null) {
      cb = batchCallback;
    }

    var filter = null;
    if (typeof options === 'object' && options.force === true) {
      filter = this._matchIfAsteriskFilter;
    } else if (!entity.__etag) {
      throw '__etag in entity are required if force is not used';
    } else {
      filter = function(options) {
        options.headers['if-match'] = entity.__etag;
        return options;
      };
    }

    this._makeRequest(method, utils.prepareEntityPath(table, entity.PartitionKey, entity.RowKey), null, utils.serializeEntity(entity), filter, this._204Cb.bind(this, cb));
    return this;
  },

  updateEntity: function updateEntity(table, entity, options, cb) {
    return this._updateMergeEntity('PUT', table, entity, options, cb);
  },

  mergeEntity: function mergeEntity(table, entity, options, cb) {
    return this._updateMergeEntity('MERGE', table, entity, options, cb);
  },

  deleteEntity: function deleteEntity(table, entity, options, cb) {
    if (!entity || typeof entity.PartitionKey !== 'string' || typeof entity.RowKey !== 'string') {
      throw 'PartitionKey and RowKey in entity are required';
    }
    if (typeof options === 'function') {
      cb = options;
    } else if (cb == null) {
      cb = batchCallback;
    }

    var filter = null;
    if (typeof options === 'object' && options.force === true) {
      filter = this._matchIfAsteriskFilter;
    } else if (!entity.__etag) {
      throw '__etag in entity are required if force is not used';
    } else {
      filter = function(options) {
        options.headers['if-match'] = entity.__etag;
        return options;
      };
    }

    this._makeRequest('DELETE', utils.prepareEntityPath(table, entity.PartitionKey, entity.RowKey), null, null, filter, this._204Cb.bind(this, cb));
    return this;
  },

  _getEntityCb: function _getEntityCb(cb, err, data) {
    if (!err && data.statusCode === 200) {
      var entity = utils.deserializeEntity(data.body);
      entity.__etag = data.headers.etag;
      return cb(null, entity);
    } else {
      return cb(err);
    }
  },
  getEntity: function getEntity(table, partitionKey, rowKey, options, cb) {
    if (typeof partitionKey !== 'string' || typeof rowKey !== 'string') {
      throw 'The partitionKey and rowKey must be a string';
    }
    var filter = null, qs = null;

    if (typeof options === 'function') {
      cb = options;
    } else if (cb == null) {
      cb = batchCallback;
    }
    if (options && 'onlyFields' in options) {
      if (!Array.isArray(options.onlyFields) || options.onlyFields.length === 0) {
        throw 'The onlyFields field from options must be an nonempty array if used';
      } else {
        qs = {
          $select: utils.prepareSelectQS(options.onlyFields)
        };
      }
    }

    this._makeRequest('GET', utils.prepareEntityPath(table, partitionKey, rowKey), qs, null, filter, this._getEntityCb.bind(this, cb));
    return this;
  },

  _queryEntitiesCb: function _queryEntitiesCb(cb, err, data) {
    if (!err && data.statusCode === 200) {
      var results = new Array(data.body.value.length);
      data.body.value.forEach(function(r, i) {
        this[i] = utils.deserializeEntity(r);
      }, results);
      var continuation;
      if (data.headers['x-ms-continuation-nextpartitionkey']) {
        continuation = [''+data.headers['x-ms-continuation-nextpartitionkey'], ''+data.headers['x-ms-continuation-nextrowkey']];
      }
      return cb(null, results, continuation);
    } else {
      return cb(err);
    }
  },
  queryEntities: function queryEntities(table, options, cb) {
    if (typeof options === 'function') {
      cb = options;
    } else if (cb == null) {
      cb = batchCallback;
    }
    var qs = null, filter = null;
    if (typeof options === 'object') {
      if (options.limitTo) {
        if (options.limitTo > 0 && options.limitTo <= 1000) {
          if (qs == null) {
            qs = {};
          }
          qs.$top = ''+options.limitTo;
        } else {
          throw 'The limitTo must be in rage [1, 1000]';
        }
      }
      if (options.continuation && Array.isArray(options.continuation) && options.continuation.length === 2) {
        if (qs == null) {
          qs = {};
        }
        if (typeof options.continuation[0] === 'string') {
          qs.NextPartitionKey = options.continuation[0];
        } else {
          throw 'The continuation array must contain strings';
        }
        if (typeof options.continuation[1] === 'string') {
          qs.NextRowKey = options.continuation[1];
        } else {
          throw 'The continuation array must contain strings';
        }
      }
      if ('onlyFields' in options) {
        if (!Array.isArray(options.onlyFields) || options.onlyFields.length === 0) {
          throw 'The onlyFields field from options must be an nonempty array if used';
        } else {
          if (qs == null) {
            qs = {};
          }
          qs.$select = utils.prepareSelectQS(options.onlyFields);
        }
      }
      if (options.query && ((options.query._query && options.query._query.length > 0) || (typeof options.query === 'string' && options.query._query.length > 0))) {
        if (qs == null) {
          qs = {};
        }
        qs.$filter = typeof options.query === 'string' ? options.query : options.query._query;
      }
      if (options.forceEtags === true) {
        filter = this._forceFullMetadata;
      }
    }

    this._makeRequest('GET', table+'()', qs, null, filter, this._queryEntitiesCb.bind(this, cb));
    return this;
  },

  startBatch: function startBatch() {
    return Batch.create(this);
  },

  generateSAS: function generateSAS(table, permissions, expiry, options) {
    var signature = [
      permissions,
      options && options.start instanceof Date ? utils.isoDateWithoutMiliseconds(options.start) : '',
      utils.isoDateWithoutMiliseconds(expiry),
      '/'+this._settings.accountName+'/'+table.toLowerCase(),
      options && typeof options.policyId === 'string' ? options.policyId : '',
      '2013-08-15',
      options && typeof options.startPK === 'string' ? options.startPK : '',
      options && typeof options.startRK === 'string' ? options.startRK : '',
      options && typeof options.endPK === 'string' ? options.endPK : '',
      options && typeof options.endRK === 'string' ? options.endRK : ''
    ];
    var sig = utils.makeSignature(this._azureKey, signature);

    var query = {
      sv: signature[5],
      tn: table,
      st: signature[1],
      se: signature[2],
      sp: signature[0]
    };
    if (query.st === '') {
      delete query.st;
    }
    if (signature[6] !== '') {
      query.spk = signature[6];
    }
    if (signature[7] !== '') {
      query.srk = signature[7];
    }
    if (signature[8] !== '') {
      query.epk = signature[8];
    }
    if (signature[9] !== '') {
      query.erk = signature[9];
    }
    if (signature[4] !== '') {
      query.si = signature[4];
    }
    query.sig = sig;

    return querystring.stringify(query);
  }
};

exports.Client = Client;