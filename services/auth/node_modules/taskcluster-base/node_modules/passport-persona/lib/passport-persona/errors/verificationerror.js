/**
 * `VerificationError` error.
 *
 * @api public
 */
function VerificationError(message) {
  Error.call(this);
  Error.captureStackTrace(this, arguments.callee);
  this.name = 'VerificationError';
  this.message = message || null;
};

/**
 * Inherit from `Error`.
 */
VerificationError.prototype.__proto__ = Error.prototype;


/**
 * Expose `VerificationError`.
 */
module.exports = VerificationError;
