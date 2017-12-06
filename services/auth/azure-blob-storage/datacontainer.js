'use strict';

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _assert = require('assert');

var _assert2 = _interopRequireDefault(_assert);

var _fastAzureStorage = require('fast-azure-storage');

var _fastAzureStorage2 = _interopRequireDefault(_fastAzureStorage);

var _taskclusterClient = require('taskcluster-client');

var _taskclusterClient2 = _interopRequireDefault(_taskclusterClient);

var _constants = require('./constants');

var _constants2 = _interopRequireDefault(_constants);

var _ajv = require('ajv');

var _ajv2 = _interopRequireDefault(_ajv);

var _utils = require('./utils');

var _debug2 = require('debug');

var _debug3 = _interopRequireDefault(_debug2);

var _datablob = require('./datablob');

var _customerrors = require('./customerrors');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var debug = (0, _debug3.default)('azure-blob-storage:account');

/**
 * This class represents an Azure Blob Storage container which stores objects in JSON format.
 * All the objects will be validated against the schema that is provided at the creation time of the container.
 */
var DataContainer = function () {

  /**
   * Options:
   * ```js
   * {
   *   // Azure connection details for use with SAS from auth.taskcluster.net
   *   account:           '...',                  // Azure storage account name
   *   container:         'AzureContainerName',   // Azure container name
   *   // TaskCluster credentials
   *   credentials: {
   *     clientId:        '...',                  // TaskCluster clientId
   *     accessToken:     '...',                  // TaskCluster accessToken
   *   },
   *   accessLevel:       'read-write',           // The access level of the container: read-only/read-write (optional)
   *   authBaseUrl:       '...',                  // baseUrl for auth (optional)
   *   schema:            '...',                  // JSON schema object
   *   schemaVersion:     1,                      // JSON schema version. (optional)
   *                                              // The default value is 1.
   *
   *   // Max number of update blob request retries
   *   updateRetries:              10,
   *   // Multiplier for computation of retry delay: 2 ^ retry * delayFactor
   *   updateDelayFactor:          100,
   *
   *   // Randomization factor added as:
   *   // delay = delay * random([1 - randomizationFactor; 1 + randomizationFactor])
   *   updateRandomizationFactor:  0.25,
   *
   *   // Maximum retry delay in ms (defaults to 30 seconds)
   *   updateMaxDelay:             30 * 1000,
   * }
   * ```
   * Using the `options` format provided above a shared-access-signature will be
   * fetched from auth.taskcluster.net. The goal with this is to reduce secret
   * configuration and reduce exposure of our Azure `accountKey`. To fetch the
   * shared-access-signature the following scope is required:
   *   `auth:azure-blob:<level>:<account>/<container>`
   *
   * In case you have the Azure credentials, the options are:
   * ```js
   * {
   *    // Azure credentials
   *    credentials: {
   *      accountName: '...',         // Azure account name
   *      accountKey: '...',          // Azure account key
   *    }
   * }
   * ```
   */
  function DataContainer(options) {
    var _this = this;

    (0, _classCallCheck3.default)(this, DataContainer);

    // validate the options
    (0, _assert2.default)(options, 'options must be given');
    (0, _assert2.default)(options.container, 'options.container must be given');
    (0, _assert2.default)(typeof options.container === 'string', 'options.container is not a string');
    (0, _assert2.default)(options.schema, 'options.schema must be given');
    (0, _assert2.default)((0, _typeof3.default)(options.schema) === 'object', 'options.schema is not an object');

    if (options.schemaVersion) {
      (0, _assert2.default)(typeof options.schemaVersion === 'number', 'options.schemaVersion is not a number');
    }

    // create an Azure Blob Storage client
    var blobService = void 0;
    if (options.account) {
      (0, _assert2.default)(typeof options.account === 'string', 'Expected `options.account` to be a string, or undefined.');

      // Create auth client to fetch SAS from auth.taskcluster.net
      var auth = new _taskclusterClient2.default.Auth({
        credentials: options.credentials,
        baseUrl: options.authBaseUrl
      });

      // Create azure blob storage client with logic for fetch SAS
      blobService = new _fastAzureStorage2.default.Blob({
        timeout: _constants2.default.AZURE_BLOB_TIMEOUT,
        accountId: options.account,
        minSASAuthExpiry: 15 * 60 * 1000,
        sas: function () {
          var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee() {
            var level, result;
            return _regenerator2.default.wrap(function _callee$(_context) {
              while (1) {
                switch (_context.prev = _context.next) {
                  case 0:
                    level = options.accessLevel || 'read-write';
                    _context.next = 3;
                    return auth.azureBlobSAS(options.account, options.container, level);

                  case 3:
                    result = _context.sent;
                    return _context.abrupt('return', result.sas);

                  case 5:
                  case 'end':
                    return _context.stop();
                }
              }
            }, _callee, _this);
          }));

          return function sas() {
            return _ref.apply(this, arguments);
          };
        }()
      });
    } else {
      (0, _assert2.default)(options.credentials.accountName, 'The `options.credentials.accountName` must be supplied.');
      (0, _assert2.default)(options.credentials.accountKey || options.credentials.sas, 'The `options.credentials.accountKey` or `options.credentials.sas` must be supplied.');

      // Create azure blob storage client with accessKey
      blobService = new _fastAzureStorage2.default.Blob({
        timeout: _constants2.default.AZURE_BLOB_TIMEOUT,
        accountId: options.credentials.accountName,
        accessKey: options.credentials.accountKey,
        sas: options.credentials.sas
      });
    }

    this.blobService = blobService;
    this.name = options.container;
    // _validateFunctionMap is a mapping from schema version to validation function generated
    // after the ajv schema compile
    this._validateFunctionMap = {};

    this.schema = options.schema;
    this.schemaVersion = options.schemaVersion ? options.schemaVersion : 1;
    this.schema.id = this._getSchemaId(this.schemaVersion);

    this.validator = (0, _ajv2.default)({
      useDefaults: true,
      format: 'full',
      verbose: true,
      allErrors: true
    });

    this.updateRetries = options.updateRetries || 10;
    this.updateDelayFactor = options.updateDelayFactor || 100;
    this.updateRandomizationFactor = options.updateRandomizationFactor || 0.25;
    this.updateMaxDelay = options.updateMaxDelay || 30 * 1000;
  }

  /**
   * @param schemaVersion - the schema version
   * @returns {string} - the id of the schema
   * @private
   */


  (0, _createClass3.default)(DataContainer, [{
    key: '_getSchemaId',
    value: function _getSchemaId(schemaVersion) {
      return 'http://' + this.blobService.options.accountId + '.blob.core.windows.net/' + (this.name + '/.schema.v' + schemaVersion + '.json');
    }

    /**
     * @param schemaVersion - the schema version
     * @returns {string} - the name of the schema
     * @private
     */

  }, {
    key: '_getSchemaName',
    value: function _getSchemaName(schemaVersion) {
      return '.schema.v' + schemaVersion;
    }

    /**
     * Saves the JSON schema in a BlockBlob.
     * This method will throw an 'AuthorizationPermissionMismatch', if the client has read-only rights
     * for the data container.
     *
     * @private
     */

  }, {
    key: '_saveSchema',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2() {
        var schemaName;
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                _context2.prev = 0;
                schemaName = this._getSchemaName(this.schemaVersion);
                _context2.next = 4;
                return this.blobService.putBlob(this.name, schemaName, { type: 'BlockBlob' }, (0, _stringify2.default)(this.schema));

              case 4:
                _context2.next = 9;
                break;

              case 6:
                _context2.prev = 6;
                _context2.t0 = _context2['catch'](0);

                // Ignore the 'AuthorizationPermissionMismatch' error that will be throw if the client has read-only rights.
                // The save of the schema can be done only by the clients with read-write access.
                if (_context2.t0.code !== 'AuthorizationPermissionMismatch') {
                  (0, _utils.rethrowDebug)('Failed to save the json schema \'' + this.schema.id + '\' with error: ' + _context2.t0, _context2.t0);
                }

              case 9:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this, [[0, 6]]);
      }));

      function _saveSchema() {
        return _ref2.apply(this, arguments);
      }

      return _saveSchema;
    }()

    /**
     * If the schema was previously saved, this method will make an integrity check, otherwise will save the schema in
     * a blockBlob.
     * @private
     */

  }, {
    key: '_cacheSchema',
    value: function () {
      var _ref3 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3() {
        var storedSchema, schemaName, schemaBlob;
        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                storedSchema = void 0;
                schemaName = this._getSchemaName(this.schemaVersion);
                _context3.prev = 2;
                _context3.next = 5;
                return this.blobService.getBlob(this.name, schemaName);

              case 5:
                schemaBlob = _context3.sent;

                storedSchema = schemaBlob.content;
                _context3.next = 15;
                break;

              case 9:
                _context3.prev = 9;
                _context3.t0 = _context3['catch'](2);

                if (!(_context3.t0.code === 'BlobNotFound')) {
                  _context3.next = 14;
                  break;
                }

                this._saveSchema();
                return _context3.abrupt('return');

              case 14:
                (0, _utils.rethrowDebug)('Failed to save the json schema \'' + this.schema.id + '\' with error: ' + _context3.t0, _context3.t0);

              case 15:
                if (!(storedSchema !== (0, _stringify2.default)(this.schema))) {
                  _context3.next = 17;
                  break;
                }

                throw new _customerrors.SchemaIntegrityCheckError('The stored schema is not the same with the schema defined.');

              case 17:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this, [[2, 9]]);
      }));

      function _cacheSchema() {
        return _ref3.apply(this, arguments);
      }

      return _cacheSchema;
    }()

    /**
     * Method that validates the content
     *
     * @param content - JSON content
     * @param schemaVersion - the schema version (optional)
     *
     * @return {object}
     * ```js
     * {
     *    valid: boolean,   // true/false if the content is valid or not
     *    errors: [],       // if the content is invalid, errors will contain an array of validation errors
     * }
     * ```
     */

  }, {
    key: 'validate',
    value: function () {
      var _ref4 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4(content) {
        var schemaVersion = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.schemaVersion;
        var ajvValidate, schemaBlob, schema, result;
        return _regenerator2.default.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                ajvValidate = this._validateFunctionMap[schemaVersion];
                // if the validate function is not available, this means that the schema is not yet loaded

                if (ajvValidate) {
                  _context4.next = 17;
                  break;
                }

                if (!(schemaVersion === this.schemaVersion)) {
                  _context4.next = 6;
                  break;
                }

                this._validateFunctionMap[this.schemaVersion] = this.validator.compile(this.schema);
                _context4.next = 17;
                break;

              case 6:
                _context4.prev = 6;
                _context4.next = 9;
                return this.blobService.getBlob(this.name, this._getSchemaName(schemaVersion));

              case 9:
                schemaBlob = _context4.sent;
                schema = JSON.parse(schemaBlob.content);
                // cache the ajv validate function

                this._validateFunctionMap[schemaVersion] = this.validator.compile(schema);
                _context4.next = 17;
                break;

              case 14:
                _context4.prev = 14;
                _context4.t0 = _context4['catch'](6);

                (0, _utils.rethrowDebug)('Failed to save the json schema \'' + this.schema.id + '\' with error: ' + _context4.t0, _context4.t0);

              case 17:
                ajvValidate = this._validateFunctionMap[schemaVersion];
                result = {
                  valid: ajvValidate(content),
                  errors: ajvValidate.errors
                };
                return _context4.abrupt('return', result);

              case 20:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this, [[6, 14]]);
      }));

      function validate(_x) {
        return _ref4.apply(this, arguments);
      }

      return validate;
    }()
  }, {
    key: 'init',
    value: function () {
      var _ref5 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee5() {
        return _regenerator2.default.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                _context5.next = 2;
                return this.ensureContainer();

              case 2:
                _context5.next = 4;
                return this._cacheSchema();

              case 4:
              case 'end':
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function init() {
        return _ref5.apply(this, arguments);
      }

      return init;
    }()

    /**
     * Ensure existence of the underlying container
     *
     * Note that this doesn't work, if authenticated with SAS.
     */

  }, {
    key: 'ensureContainer',
    value: function () {
      var _ref6 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee6() {
        return _regenerator2.default.wrap(function _callee6$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                if (!(this.blobService.options && this.blobService.options.sas)) {
                  _context6.next = 2;
                  break;
                }

                return _context6.abrupt('return');

              case 2:
                _context6.prev = 2;
                _context6.next = 5;
                return this.blobService.createContainer(this.name);

              case 5:
                _context6.next = 10;
                break;

              case 7:
                _context6.prev = 7;
                _context6.t0 = _context6['catch'](2);

                if (!_context6.t0 || _context6.t0.code !== 'ContainerAlreadyExists') {
                  (0, _utils.rethrowDebug)('Failed to ensure container \'' + this.name + '\' with error: ' + _context6.t0, _context6.t0);
                }

              case 10:
              case 'end':
                return _context6.stop();
            }
          }
        }, _callee6, this, [[2, 7]]);
      }));

      function ensureContainer() {
        return _ref6.apply(this, arguments);
      }

      return ensureContainer;
    }()

    /**
     * Delete the underlying container
     *
     * Note that this doesn't work, if authenticated with SAS.
     */

  }, {
    key: 'removeContainer',
    value: function () {
      var _ref7 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee7() {
        return _regenerator2.default.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                _context7.prev = 0;
                _context7.next = 3;
                return this.blobService.deleteContainer(this.name);

              case 3:
                _context7.next = 8;
                break;

              case 5:
                _context7.prev = 5;
                _context7.t0 = _context7['catch'](0);

                (0, _utils.rethrowDebug)('Failed to delete container "' + this.name + '" with error: ' + _context7.t0, _context7.t0);

              case 8:
              case 'end':
                return _context7.stop();
            }
          }
        }, _callee7, this, [[0, 5]]);
      }));

      function removeContainer() {
        return _ref7.apply(this, arguments);
      }

      return removeContainer;
    }()

    /**
     * Returns a paginated list of blobs contained by this container
     *
     * @param options
     * {
     *    prefix: '...',                // Prefix of blobs to list (optional)
     *    continuation: '...',          // Continuation token to continue from (optional)
     *    maxResults: 5000,             // The maximum number of blobs to return (optional)
     * }
     * @returns
     * {
     *    blobs: [],                    // An array of blob instances
     *    continuationToken: '...',     // Next token if not at end of list
     * }
     */

  }, {
    key: 'listBlobs',
    value: function () {
      var _ref8 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee8(options) {
        var _this2 = this;

        var blobs, result;
        return _regenerator2.default.wrap(function _callee8$(_context8) {
          while (1) {
            switch (_context8.prev = _context8.next) {
              case 0:
                options = options || {};
                blobs = [];
                _context8.prev = 2;
                _context8.next = 5;
                return this.blobService.listBlobs(this.name, {
                  prefix: options.prefix,
                  marker: options.continuation,
                  maxResults: options.maxResults
                });

              case 5:
                result = _context8.sent;


                blobs = result.blobs.map(function (blob) {
                  var options = {
                    container: _this2,
                    name: blob.name,
                    contentLanguage: blob.contentLanguage,
                    contentDisposition: blob.contentDisposition,
                    cacheControl: blob.cacheControl
                  };
                  // the list can't contain the blobs that store the JSON schema
                  if (blob.type === 'BlockBlob' && !/.schema.v*/i.test(blob.name)) {
                    return new _datablob.DataBlockBlob(options);
                  } else if (blob.type === 'AppendBlob') {
                    return new _datablob.AppendDataBlob(options);
                  } else {
                    // PageBlobs are not supported
                  }
                });

                return _context8.abrupt('return', {
                  blobs: blobs || [],
                  continuationToken: result.nextMarker
                });

              case 10:
                _context8.prev = 10;
                _context8.t0 = _context8['catch'](2);

                (0, _utils.rethrowDebug)('Failed to list blobs for container "' + this.name + '" with error: ' + _context8.t0, _context8.t0);

              case 13:
              case 'end':
                return _context8.stop();
            }
          }
        }, _callee8, this, [[2, 10]]);
      }));

      function listBlobs(_x3) {
        return _ref8.apply(this, arguments);
      }

      return listBlobs;
    }()

    /**
     * Execute the provided function on each data block blob from this container while handling pagination.
     *
     * @param {function} handler
     * ```js
     *   function(blob) {
     *      return new Promise(...); // Do something with the blob
     *   }
     * ```
     * @param {object} options - Options on the form
     * ```js
     *    {
     *      prefix: '...',      // Prefix of blobs to list (optional)
     *      limit:  1000,       // Max number of parallel handler calls
     *    }
     * ```
     */

  }, {
    key: 'scanDataBlockBlob',
    value: function () {
      var _ref9 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee10(handler, options) {
        var _this3 = this;

        var marker, result;
        return _regenerator2.default.wrap(function _callee10$(_context10) {
          while (1) {
            switch (_context10.prev = _context10.next) {
              case 0:
                (0, _assert2.default)(typeof handler === 'function', 'handler must be a function');
                options = options || {};

                _context10.prev = 2;
                marker = void 0;

              case 4:
                _context10.next = 6;
                return this.blobService.listBlobs(this.name, {
                  prefix: options.prefix,
                  marker: marker,
                  maxResults: options.limit
                });

              case 6:
                result = _context10.sent;
                _context10.next = 9;
                return _promise2.default.all(result.blobs.map(function () {
                  var _ref10 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee9(blob) {
                    var dataBlob;
                    return _regenerator2.default.wrap(function _callee9$(_context9) {
                      while (1) {
                        switch (_context9.prev = _context9.next) {
                          case 0:
                            if (!(blob.type === 'BlockBlob')) {
                              _context9.next = 5;
                              break;
                            }

                            // 1. create an instance of DataBlockBlob from the result blob
                            dataBlob = new _datablob.DataBlockBlob({
                              name: blob.name,
                              container: _this3,
                              contentLanguage: blob.contentLanguage,
                              contentDisposition: blob.contentDisposition,
                              cacheControl: blob.cacheControl
                            });
                            // we need to take extra care for the blobs that contain the schema information.
                            // the handle can't be applied on blobs that store the JSON schema

                            if (/.schema.v*/i.test(dataBlob.name)) {
                              _context9.next = 5;
                              break;
                            }

                            _context9.next = 5;
                            return handler(dataBlob);

                          case 5:
                          case 'end':
                            return _context9.stop();
                        }
                      }
                    }, _callee9, _this3);
                  }));

                  return function (_x6) {
                    return _ref10.apply(this, arguments);
                  };
                }()));

              case 9:

                marker = result.nextMarker || undefined;

              case 10:
                if (marker) {
                  _context10.next = 4;
                  break;
                }

              case 11:
                _context10.next = 16;
                break;

              case 13:
                _context10.prev = 13;
                _context10.t0 = _context10['catch'](2);

                (0, _utils.rethrowDebug)('Failed to execute the handler with error: ' + _context10.t0, _context10.t0);

              case 16:
              case 'end':
                return _context10.stop();
            }
          }
        }, _callee10, this, [[2, 13]]);
      }));

      function scanDataBlockBlob(_x4, _x5) {
        return _ref9.apply(this, arguments);
      }

      return scanDataBlockBlob;
    }()

    /**
     * Returns an instance of DataBlockBlob.
     * By using this instance of blob, a JSON file can be stored in azure storage.
     * The content will be validated against the schema defined at the container level.
     *
     * @param options - Options on the form
     * ```js
     * {
     *    name: '...',                // The name of the blob (required)
     *    metadata: '...',            // Name-value pairs associated with the blob as metadata
     *    contentEncoding: '...',     // The content encoding of the blob
     *    contentLanguage: '...',     // The content language of the blob
     *    cacheControl: '...',        // The cache control of the blob
     *    contentDisposition: '...',  // The content disposition of the blob
     *    cacheContent: true|false,   // This can be set true in order to keep a reference of the blob content.
     *                                // Default value is false
     * }
     * ```
     * @param content - content in JSON format of the blob
     * @returns {DataBlockBlob} an instance of DataBlockBlob
     */

  }, {
    key: 'createDataBlockBlob',
    value: function () {
      var _ref11 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee11(options, content) {
        var blob;
        return _regenerator2.default.wrap(function _callee11$(_context11) {
          while (1) {
            switch (_context11.prev = _context11.next) {
              case 0:
                (0, _assert2.default)(content, 'The content of the blob must be provided.');
                options = options || {};
                options.container = this;

                blob = new _datablob.DataBlockBlob(options);
                _context11.next = 6;
                return blob.create(content);

              case 6:
                return _context11.abrupt('return', blob);

              case 7:
              case 'end':
                return _context11.stop();
            }
          }
        }, _callee11, this);
      }));

      function createDataBlockBlob(_x7, _x8) {
        return _ref11.apply(this, arguments);
      }

      return createDataBlockBlob;
    }()

    /**
     * Create an instance of AppendDataBlob.
     * This type is optimized for fast append operations and all writes happen at the end of the blob.
     * Each object appended must be in JSON format and must match the schema defined at container level.
     * Updating and deleting existing content is not supported.
     *
     * @param options - Options on the form
     * ```js
     * {
     *    name: '...',                // The name of the blob (required)
     *    metadata: '...',            // Name-value pairs associated with the blob as metadata
     *    contentEncoding: '...',     // The content encoding of the blob
     *    contentLanguage: '...',     // The content language of the blob
     *    cacheControl: '...',        // The cache control of the blob
     *    contentDisposition: '...',  // The content disposition of the blob
     * }
     * ```
     * @param content - the content, in JSON format, that should be appended(optional)
     */

  }, {
    key: 'createAppendDataBlob',
    value: function () {
      var _ref12 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee12(options, content) {
        var blob;
        return _regenerator2.default.wrap(function _callee12$(_context12) {
          while (1) {
            switch (_context12.prev = _context12.next) {
              case 0:
                options = options || {};
                options.container = this;

                blob = new _datablob.AppendDataBlob(options);
                _context12.next = 5;
                return blob.create();

              case 5:
                if (!content) {
                  _context12.next = 8;
                  break;
                }

                _context12.next = 8;
                return blob.append();

              case 8:
                return _context12.abrupt('return', blob);

              case 9:
              case 'end':
                return _context12.stop();
            }
          }
        }, _callee12, this);
      }));

      function createAppendDataBlob(_x9, _x10) {
        return _ref12.apply(this, arguments);
      }

      return createAppendDataBlob;
    }()

    /**
     * Returns an instance of DataBlockBlob or AppendDataBlob.
     * It makes sense to set the cacheContent to true only for DataBlockBlob, because AppendDataBlob blobs do not keep
     * the content in their instance.
     *
     * @param blobName - the name of the blob
     * @param cacheContent - true in order to cache the content
     */

  }, {
    key: 'load',
    value: function () {
      var _ref13 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee13(blobName, cacheContent) {
        var properties, blob, options;
        return _regenerator2.default.wrap(function _callee13$(_context13) {
          while (1) {
            switch (_context13.prev = _context13.next) {
              case 0:
                (0, _assert2.default)(blobName, 'The name of the blob must be specified.');

                properties = void 0;
                _context13.prev = 2;
                _context13.next = 5;
                return this.blobService.getBlobProperties(this.name, blobName);

              case 5:
                properties = _context13.sent;
                _context13.next = 12;
                break;

              case 8:
                _context13.prev = 8;
                _context13.t0 = _context13['catch'](2);

                /**
                 * For getBlobProperties, if the blob does not exist, Azure does not send a proper BlobNotFound error.
                 * Azure sends a response with statusCode: 404, statusMessage: 'The specified blob does not exists.' and
                 * without any payload. Because of this, the error received here will look like this:
                 *
                 *  { ErrorWithoutCodeError: No error message given, in payload ''
                 *     name: 'ErrorWithoutCodeError',
                 *     code: 'ErrorWithoutCode',
                 *     statusCode: 404,
                 *     retries: 0 }
                 * Probably in the future, Azure will correct the response, but, till then we will override the name and code.
                 */
                if (_context13.t0.statusCode === 404 && _context13.t0.name === 'ErrorWithoutCodeError') {
                  _context13.t0.code = 'BlobNotFound';
                  _context13.t0.name = 'BlobNotFoundError';
                  _context13.t0.message = 'The specified blob does not exist.';
                }
                (0, _utils.rethrowDebug)('Failed to load the blob \'' + blobName + '\' from container "' + this.name + '" with error: ' + _context13.t0, _context13.t0);

              case 12:
                blob = void 0;
                options = {
                  name: blobName,
                  container: this,
                  cacheContent: cacheContent
                };

                if (!(properties.type === 'BlockBlob')) {
                  _context13.next = 18;
                  break;
                }

                blob = new _datablob.DataBlockBlob(options);
                _context13.next = 23;
                break;

              case 18:
                if (!(properties.type === 'AppendBlob')) {
                  _context13.next = 22;
                  break;
                }

                return _context13.abrupt('return', new _datablob.AppendDataBlob(options));

              case 22:
                return _context13.abrupt('return', null);

              case 23:
                _context13.next = 25;
                return blob.load();

              case 25:
                return _context13.abrupt('return', blob);

              case 26:
              case 'end':
                return _context13.stop();
            }
          }
        }, _callee13, this, [[2, 8]]);
      }));

      function load(_x11, _x12) {
        return _ref13.apply(this, arguments);
      }

      return load;
    }()

    /**
     * Removes a blob from Azure storage without loading it.
     * Returns true, if the blob was deleted. It makes sense to read the return value only if `ignoreIfNotExists` is set
     * to value true.
     *
     * @param blob
     * @param ignoreIfNotExists - true in order to ignore the error that is thrown in case the blob does not exist
     */

  }, {
    key: 'remove',
    value: function () {
      var _ref14 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee14(blob, ignoreIfNotExists) {
        return _regenerator2.default.wrap(function _callee14$(_context14) {
          while (1) {
            switch (_context14.prev = _context14.next) {
              case 0:
                (0, _assert2.default)(blob, 'The blob name must be specified.');

                _context14.prev = 1;
                _context14.next = 4;
                return this.blobService.deleteBlob(this.name, blob);

              case 4:
                return _context14.abrupt('return', true);

              case 7:
                _context14.prev = 7;
                _context14.t0 = _context14['catch'](1);

                if (!(ignoreIfNotExists && _context14.t0 && _context14.t0.code === 'BlobNotFound')) {
                  _context14.next = 11;
                  break;
                }

                return _context14.abrupt('return', false);

              case 11:
                (0, _utils.rethrowDebug)('Failed to remove the blob \'' + blob + '\' from container "' + this.name + '" with error: ' + _context14.t0, _context14.t0);

              case 12:
              case 'end':
                return _context14.stop();
            }
          }
        }, _callee14, this, [[1, 7]]);
      }));

      function remove(_x13, _x14) {
        return _ref14.apply(this, arguments);
      }

      return remove;
    }()
  }]);
  return DataContainer;
}();

module.exports.DataContainer = DataContainer;
//# sourceMappingURL=datacontainer.js.map
