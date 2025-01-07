export class ErrorReply extends Error {
  /**
   * @param {object} params
   * @param {string} params.code - The error code
   * @param {string} params.message - The error message
   * @param {object} params.details - Additional error details
   */
  constructor({ code, message, details }) {
    super();

    Error.captureStackTrace(this, this.constructor);

    this.code = code;
    this.message = message;
    this.details = details;
  }
}

/**
 * Report the given error.  This throws an exception and must be called in a
 * context that will lead to that error being handled by the express
 * error-handling middleware.
 * @param {string} code - The error code
 * @param {string} message - The error message
 * @param {object} details - Additional error details
 * @throws {ErrorReply}
 */
export const reportError = (code, message, details = {}) => {
  throw new ErrorReply({ code, message, details });
};
