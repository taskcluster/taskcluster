class ErrorReply extends Error {
  constructor({code, message, details}) {
    super();

    Error.captureStackTrace(this, this.constructor);
    
    this.code = code;
    this.message = message;
    this.details = details;
  }
}
  
module.exports = ErrorReply;