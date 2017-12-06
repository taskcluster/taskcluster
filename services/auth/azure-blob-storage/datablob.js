'use strict';

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _getPrototypeOf = require('babel-runtime/core-js/object/get-prototype-of');

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _possibleConstructorReturn2 = require('babel-runtime/helpers/possibleConstructorReturn');

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _get2 = require('babel-runtime/helpers/get');

var _get3 = _interopRequireDefault(_get2);

var _inherits2 = require('babel-runtime/helpers/inherits');

var _inherits3 = _interopRequireDefault(_inherits2);

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _assert = require('assert');

var _assert2 = _interopRequireDefault(_assert);

var _debug2 = require('debug');

var _debug3 = _interopRequireDefault(_debug2);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _customerrors = require('./customerrors');

var _utils = require('./utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var debug = (0, _debug3.default)('azure-blob-storage:blob');

/**
 * Base class for data blobs
 */
var DataBlob = function () {

  /**
   * @param options - Options on the form
   * ```js
   * {
   *    name: '...',                  // The name of the blob (required)
   *    type: 'BlockBlob|AppendBlob', // The type of the blob (required)
   *    container: '...',             // An instance of DataContainer (required)
   *    contentEncoding: '...',       // The content encoding of the blob
   *    contentLanguage: '...',       // The content language of the blob
   *    cacheControl: '...',          // The cache control of the blob
   *    contentDisposition: '...',    // The content disposition of the blob
   *    cacheContent: true|false,     // This can be set true in order to keep a reference of the blob content.
   *                                  // Default value is false
   * }
   * ```
   */
  function DataBlob(options) {
    (0, _classCallCheck3.default)(this, DataBlob);

    options = options || {};
    (0, _assert2.default)(options, 'options must be specified.');
    (0, _assert2.default)(options.container, 'The container instance, `options.container`, must be specified.');
    (0, _assert2.default)(typeof options.name === 'string', 'The name of the blob, `options.name` must be specified.');

    this.container = options.container;
    this.blobService = this.container.blobService;
    this.cacheContent = options.cacheContent || false;

    this.name = options.name;
    this.type = options.type;
    this.contentType = 'application/json';
    this.contentLanguage = options.contentLanguage;
    this.contentDisposition = options.contentDisposition;
    this.cacheControl = options.cacheControl;
  }

  (0, _createClass3.default)(DataBlob, [{
    key: '_validateJSON',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(content) {
        var result, error;
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                _context.next = 2;
                return this.container.validate(content, this.version ? this.version : this.container.schemaVersion);

              case 2:
                result = _context.sent;

                if (result.valid) {
                  _context.next = 9;
                  break;
                }

                debug('Failed to validate the blob content against schema with id: \n          ' + this.container.schema.id + ', errors: ' + result.errors);
                error = new _customerrors.SchemaValidationError('Failed to validate the blob content against schema with id: \n                                            ' + this.container.schema.id);

                error.content = content;
                error.validationErrors = result.errors;
                throw error;

              case 9:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function _validateJSON(_x) {
        return _ref.apply(this, arguments);
      }

      return _validateJSON;
    }()
  }, {
    key: '_cache',
    value: function _cache(content) {
      this.content = this.cacheContent ? content : undefined;
    }

    /**
     * Creates the blob in Azure storage
     *
     * @param content - content of the blob
     * @param options - options to pass to azure
     */

  }, {
    key: '_create',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(content, options) {
        var blobOptions, result;
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                blobOptions = _lodash2.default.defaults({}, {
                  type: this.type,
                  contentType: this.contentType,
                  contentLanguage: this.contentLanguage,
                  contentDisposition: this.contentDisposition,
                  cacheControl: this.cacheControl
                }, options || {});
                _context2.prev = 1;
                _context2.next = 4;
                return this.blobService.putBlob(this.container.name, this.name, blobOptions, content);

              case 4:
                result = _context2.sent;

                this.eTag = result.eTag;
                this._cache(content);
                _context2.next = 12;
                break;

              case 9:
                _context2.prev = 9;
                _context2.t0 = _context2['catch'](1);

                (0, _utils.rethrowDebug)('Failed to create the blob "' + this.name + '" with error: ' + _context2.t0, _context2.t0);

              case 12:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this, [[1, 9]]);
      }));

      function _create(_x2, _x3) {
        return _ref2.apply(this, arguments);
      }

      return _create;
    }()

    /**
     * Remove this blob if the content was not modified, unless `ignoreChanges` is set
     */

  }, {
    key: 'remove',
    value: function () {
      var _ref3 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3(ignoreChanges, ignoreIfNotExists) {
        var options;
        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                options = {};

                if (!ignoreChanges) {
                  options.ifMatch = this.eTag;
                }
                _context3.prev = 2;
                _context3.next = 5;
                return this.blobService.deleteBlob(this.container.name, this.name, options);

              case 5:
                _context3.next = 12;
                break;

              case 7:
                _context3.prev = 7;
                _context3.t0 = _context3['catch'](2);

                if (!(ignoreIfNotExists && _context3.t0 && _context3.t0.code === 'BlobNotFound')) {
                  _context3.next = 11;
                  break;
                }

                return _context3.abrupt('return');

              case 11:
                (0, _utils.rethrowDebug)('Failed to remove the blob \'' + this.name + '\'' + (' from container "' + this.container.name + '" with error: ' + _context3.t0), _context3.t0);

              case 12:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this, [[2, 7]]);
      }));

      function remove(_x4, _x5) {
        return _ref3.apply(this, arguments);
      }

      return remove;
    }()
  }]);
  return DataBlob;
}();

/**
 * An instance of DataBlockBlob is a reference to an azure block blob which contains a JSON file.
 * The content of the DataBlockBlob is validated against the schema stored at the container level.
 */


var DataBlockBlob = function (_DataBlob) {
  (0, _inherits3.default)(DataBlockBlob, _DataBlob);

  function DataBlockBlob(options) {
    (0, _classCallCheck3.default)(this, DataBlockBlob);

    options.type = 'BlockBlob';
    return (0, _possibleConstructorReturn3.default)(this, (DataBlockBlob.__proto__ || (0, _getPrototypeOf2.default)(DataBlockBlob)).call(this, options));
  }

  (0, _createClass3.default)(DataBlockBlob, [{
    key: '_serialize',
    value: function _serialize(json) {
      try {
        return (0, _stringify2.default)({
          content: json,
          version: this.version ? this.version : this.container.schemaVersion
        });
      } catch (error) {
        debug('Failed to serialize the content of the blob: ' + this.name + ' with error: ' + error + ', ' + error.stack);
        throw new _customerrors.BlobSerializationError('Failed to serialize the content of the blob: ' + this.name);
      }
    }

    /**
     * Load the content of this blob.
     */

  }, {
    key: 'load',
    value: function () {
      var _ref4 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4() {
        var options, blob, deserializedContent, content;
        return _regenerator2.default.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                // load the content only if the eTag of our local data doesn't match the copy on the server
                options = {};

                if (this.cacheContent) {
                  options.ifNoneMatch = this.eTag;
                }
                _context4.prev = 2;
                _context4.next = 5;
                return this.blobService.getBlob(this.container.name, this.name, options);

              case 5:
                blob = _context4.sent;


                // update the properties
                this.eTag = blob.eTag;
                this.contentType = blob.contentType;
                this.contentLanguage = blob.contentLanguage;
                this.contentDisposition = blob.contentDisposition;
                this.cacheControl = blob.cacheControl;

                deserializedContent = JSON.parse(blob.content);
                content = deserializedContent.content;

                this.version = deserializedContent.version;
                // Validate the JSON against the schema
                _context4.next = 16;
                return this._validateJSON(content);

              case 16:
                this._cache(content);
                return _context4.abrupt('return', content);

              case 20:
                _context4.prev = 20;
                _context4.t0 = _context4['catch'](2);

                if (!(_context4.t0 && _context4.t0.statusCode === 304)) {
                  _context4.next = 24;
                  break;
                }

                return _context4.abrupt('return', this.content);

              case 24:
                (0, _utils.rethrowDebug)('Failed to load the blob "' + this.name + '" with error: ' + _context4.t0, _context4.t0);

              case 25:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this, [[2, 20]]);
      }));

      function load() {
        return _ref4.apply(this, arguments);
      }

      return load;
    }()

    /**
     * The method creates this blob on azure blob storage.
     * The blob can be created without content. The content can be uploaded later using `modify` method.
     *
     * @param content - a JSON object
     */

  }, {
    key: 'create',
    value: function () {
      var _ref5 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee5(content, options) {
        return _regenerator2.default.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                (0, _assert2.default)(content, 'content must be specified');

                // 1. Validate the content against the schema
                _context5.next = 3;
                return this._validateJSON(content);

              case 3:
                _context5.next = 5;
                return (0, _get3.default)(DataBlockBlob.prototype.__proto__ || (0, _getPrototypeOf2.default)(DataBlockBlob.prototype), '_create', this).call(this, this._serialize(content), options);

              case 5:

                // 3. cache the raw content and not the serialized one
                this._cache(content);

              case 6:
              case 'end':
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function create(_x6, _x7) {
        return _ref5.apply(this, arguments);
      }

      return create;
    }()

    /**
     * Update the content of the stored JSON.
     *
     * The JSON has the following structure:
     * ```js
     * {
     *    content: '...',
     *    version: 1
     * }
     * ```
     * @param options - Options on the form:
     * ```js
     * {
     *    contentLanguage: '...',
     *    contentDisposition: '...',
     *    cacheControl: '...'
     * }
     * ```
     * @param modifier - function that is called to update the content
     */

  }, {
    key: 'modify',
    value: function () {
      var _ref6 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee7(modifier, options) {
        var _this2 = this;

        var attemptsLeft, modifiedContent, attemptModify;
        return _regenerator2.default.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                options = options || {};
                options.type = this.type;
                (0, _assert2.default)(modifier instanceof Function, 'The `modifier` must be a function.');

                // Attempt to modify this object
                attemptsLeft = this.container.updateRetries;
                modifiedContent = void 0;

                attemptModify = function () {
                  var _ref7 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee6() {
                    var content, clonedContent, result;
                    return _regenerator2.default.wrap(function _callee6$(_context6) {
                      while (1) {
                        switch (_context6.prev = _context6.next) {
                          case 0:
                            _context6.prev = 0;
                            _context6.next = 3;
                            return _this2.load();

                          case 3:
                            content = _context6.sent;


                            // 2. run the modifier function
                            clonedContent = _lodash2.default.cloneDeep(content);

                            modifier(clonedContent);
                            modifiedContent = clonedContent;

                            // 3. validate against the schema
                            _context6.next = 9;
                            return _this2._validateJSON(clonedContent);

                          case 9:

                            // 4. update the resource
                            options.ifMatch = _this2.eTag;

                            _context6.next = 12;
                            return _this2.blobService.putBlob(_this2.container.name, _this2.name, options, _this2._serialize(modifiedContent));

                          case 12:
                            result = _context6.sent;

                            _this2.eTag = result.eTag;
                            _context6.next = 27;
                            break;

                          case 16:
                            _context6.prev = 16;
                            _context6.t0 = _context6['catch'](0);

                            // rethrow error, if it's not caused by optimistic concurrency
                            if (!_context6.t0 || _context6.t0.code !== 'ConditionNotMet') {
                              (0, _utils.rethrowDebug)('Failed to update blob "' + _this2.name + '" with error: ' + _context6.t0, _context6.t0);
                            }

                            // Decrement number of attempts left
                            attemptsLeft -= 1;

                            if (!(attemptsLeft === 0)) {
                              _context6.next = 23;
                              break;
                            }

                            debug('ERROR: the maximum number of retries exhausted, we might have congestion');
                            throw new _customerrors.CongestionError('the maximum number of retries exhausted, check for congestion');

                          case 23:
                            _context6.next = 25;
                            return (0, _utils.sleep)((0, _utils.computeDelay)(attemptsLeft, _this2.container.updateDelayFactor, _this2.container.updateRandomizationFactor, _this2.container.updateMaxDelay));

                          case 25:
                            _context6.next = 27;
                            return attemptModify();

                          case 27:
                          case 'end':
                            return _context6.stop();
                        }
                      }
                    }, _callee6, _this2, [[0, 16]]);
                  }));

                  return function attemptModify() {
                    return _ref7.apply(this, arguments);
                  };
                }();

                _context7.next = 8;
                return attemptModify();

              case 8:
                // cache the raw content and not the one which is versioned
                this._cache(modifiedContent);

              case 9:
              case 'end':
                return _context7.stop();
            }
          }
        }, _callee7, this);
      }));

      function modify(_x8, _x9) {
        return _ref6.apply(this, arguments);
      }

      return modify;
    }()
  }]);
  return DataBlockBlob;
}(DataBlob);

/**
 * An instance of AppendDataBlob is a reference to an azure append blob.
 * Each appended object must be in JSON format and must match the schema defined at the container level.
 * Updating and deleting existing content is not supported.
 */


var AppendDataBlob = function (_DataBlob2) {
  (0, _inherits3.default)(AppendDataBlob, _DataBlob2);

  function AppendDataBlob(options) {
    (0, _classCallCheck3.default)(this, AppendDataBlob);

    options.type = 'AppendBlob';

    var _this3 = (0, _possibleConstructorReturn3.default)(this, (AppendDataBlob.__proto__ || (0, _getPrototypeOf2.default)(AppendDataBlob)).call(this, options));

    _this3.cacheContent = false;
    return _this3;
  }

  (0, _createClass3.default)(AppendDataBlob, [{
    key: '_serialize',
    value: function _serialize(content) {
      try {
        return (0, _stringify2.default)(content);
      } catch (error) {
        debug('Failed to serialize the content of the blob: ' + this.name + ' with error: ' + error + ', ' + error.stack);
        throw new _customerrors.BlobSerializationError('Failed to serialize the content of the blob: ' + this.name);
      }
    }

    /**
     * Append content that should be conform to container schema
     *
     * @param content - the content that should be appended
     */

  }, {
    key: 'append',
    value: function () {
      var _ref8 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee8(content) {
        return _regenerator2.default.wrap(function _callee8$(_context8) {
          while (1) {
            switch (_context8.prev = _context8.next) {
              case 0:
                _context8.next = 2;
                return this._validateJSON(content);

              case 2:
                _context8.prev = 2;
                _context8.next = 5;
                return this.blobService.appendBlock(this.container.name, this.name, {}, this._serialize(content));

              case 5:
                _context8.next = 10;
                break;

              case 7:
                _context8.prev = 7;
                _context8.t0 = _context8['catch'](2);

                (0, _utils.rethrowDebug)('Failed to append content for blob \'' + this.name + '\' with error: ' + _context8.t0, _context8.t0);

              case 10:
              case 'end':
                return _context8.stop();
            }
          }
        }, _callee8, this, [[2, 7]]);
      }));

      function append(_x10) {
        return _ref8.apply(this, arguments);
      }

      return append;
    }()

    /**
     * Load the content of this append blob.
     */

  }, {
    key: 'load',
    value: function () {
      var _ref9 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee9() {
        var blob;
        return _regenerator2.default.wrap(function _callee9$(_context9) {
          while (1) {
            switch (_context9.prev = _context9.next) {
              case 0:
                _context9.prev = 0;
                _context9.next = 3;
                return this.blobService.getBlob(this.container.name, this.name);

              case 3:
                blob = _context9.sent;


                // update the properties
                this.eTag = blob.eTag;
                this.contentType = blob.contentType;
                this.contentLanguage = blob.contentLanguage;
                this.contentDisposition = blob.contentDisposition;
                this.cacheControl = blob.cacheControl;

                return _context9.abrupt('return', blob.content);

              case 12:
                _context9.prev = 12;
                _context9.t0 = _context9['catch'](0);

                (0, _utils.rethrowDebug)('Failed to load the blob "' + this.name + '" with error: ' + _context9.t0, _context9.t0);

              case 15:
              case 'end':
                return _context9.stop();
            }
          }
        }, _callee9, this, [[0, 12]]);
      }));

      function load() {
        return _ref9.apply(this, arguments);
      }

      return load;
    }()

    /**
     * Creates the blob in Azure storage
     */

  }, {
    key: 'create',
    value: function () {
      var _ref10 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee10(options) {
        return _regenerator2.default.wrap(function _callee10$(_context10) {
          while (1) {
            switch (_context10.prev = _context10.next) {
              case 0:
                _context10.next = 2;
                return this._create(options);

              case 2:
              case 'end':
                return _context10.stop();
            }
          }
        }, _callee10, this);
      }));

      function create(_x11) {
        return _ref10.apply(this, arguments);
      }

      return create;
    }()
  }]);
  return AppendDataBlob;
}(DataBlob);

module.exports = {
  DataBlockBlob: DataBlockBlob,
  AppendDataBlob: AppendDataBlob
};
//# sourceMappingURL=datablob.js.map
