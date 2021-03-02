class ErrorReply extends Error {
  constructor({ code, message, details }) {
    super();

    Error.captureStackTrace(this, this.constructor);

    this.code = code;
    this.message = message;
    this.details = details;
  }
}

// Report the given error.  This throws an exception and must be called in a
// context that will lead to that error being handled by the express
// error-handling middleware.
const reportError = (code, message, details = {}) => {
  throw new ErrorReply({ code, message, details });
};

module.exports = { ErrorReply, reportError };
