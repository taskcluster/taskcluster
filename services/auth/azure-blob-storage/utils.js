'use strict';

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _debug2 = require('debug');

var _debug3 = _interopRequireDefault(_debug2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var debug = (0, _debug3.default)('azure-blob-storage:utils');

exports.rethrowDebug = function (errorMessage, error) {
  debug(errorMessage);
  throw error;
};

/*
 * Return promise to sleep for a `delay` ms
 *
 * @param   {Number} delay - Number of ms to sleep.
 * @returns {Promise} A promise that will be resolved after `delay` ms
 */
exports.sleep = function (delay) {
  return new _promise2.default(function (resolve) {
    setTimeout(resolve, delay);
  });
};

exports.computeDelay = function (retry, delayFactor, randomizationFactor, maxDelay) {
  var delay = Math.pow(2, retry) * delayFactor;
  delay *= Math.random() * 2 * randomizationFactor + 1 - randomizationFactor;
  delay = Math.min(delay, maxDelay);

  return delay;
};
//# sourceMappingURL=utils.js.map
