'use strict';

var _getPrototypeOf = require('babel-runtime/core-js/object/get-prototype-of');

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _possibleConstructorReturn2 = require('babel-runtime/helpers/possibleConstructorReturn');

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require('babel-runtime/helpers/inherits');

var _inherits3 = _interopRequireDefault(_inherits2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ExtendableError = function (_Error) {
  (0, _inherits3.default)(ExtendableError, _Error);

  function ExtendableError(message, name, code) {
    (0, _classCallCheck3.default)(this, ExtendableError);

    var _this = (0, _possibleConstructorReturn3.default)(this, (ExtendableError.__proto__ || (0, _getPrototypeOf2.default)(ExtendableError)).call(this, message));

    _this.name = name;
    _this.code = code;
    Error.captureStackTrace(_this, ExtendableError);
    return _this;
  }

  return ExtendableError;
}(Error);

var CongestionError = function (_ExtendableError) {
  (0, _inherits3.default)(CongestionError, _ExtendableError);

  function CongestionError(message) {
    (0, _classCallCheck3.default)(this, CongestionError);
    return (0, _possibleConstructorReturn3.default)(this, (CongestionError.__proto__ || (0, _getPrototypeOf2.default)(CongestionError)).call(this, message, 'CongestionError', 'Congestion'));
  }

  return CongestionError;
}(ExtendableError);

var SchemaValidationError = function (_ExtendableError2) {
  (0, _inherits3.default)(SchemaValidationError, _ExtendableError2);

  function SchemaValidationError(message) {
    (0, _classCallCheck3.default)(this, SchemaValidationError);
    return (0, _possibleConstructorReturn3.default)(this, (SchemaValidationError.__proto__ || (0, _getPrototypeOf2.default)(SchemaValidationError)).call(this, message, 'SchemaValidationError', 'SchemaValidation'));
  }

  return SchemaValidationError;
}(ExtendableError);

var BlobSerializationError = function (_ExtendableError3) {
  (0, _inherits3.default)(BlobSerializationError, _ExtendableError3);

  function BlobSerializationError(message) {
    (0, _classCallCheck3.default)(this, BlobSerializationError);
    return (0, _possibleConstructorReturn3.default)(this, (BlobSerializationError.__proto__ || (0, _getPrototypeOf2.default)(BlobSerializationError)).call(this, message, 'BlobSerializationError', 'BlobSerialization'));
  }

  return BlobSerializationError;
}(ExtendableError);

var SchemaIntegrityCheckError = function (_ExtendableError4) {
  (0, _inherits3.default)(SchemaIntegrityCheckError, _ExtendableError4);

  function SchemaIntegrityCheckError(message) {
    (0, _classCallCheck3.default)(this, SchemaIntegrityCheckError);
    return (0, _possibleConstructorReturn3.default)(this, (SchemaIntegrityCheckError.__proto__ || (0, _getPrototypeOf2.default)(SchemaIntegrityCheckError)).call(this, message, 'SchemaIntegrityCheckError', 'SchemaIntegrityCheck'));
  }

  return SchemaIntegrityCheckError;
}(ExtendableError);

module.exports = {
  CongestionError: CongestionError,
  SchemaValidationError: SchemaValidationError,
  BlobSerializationError: BlobSerializationError,
  SchemaIntegrityCheckError: SchemaIntegrityCheckError
};
//# sourceMappingURL=customerrors.js.map
