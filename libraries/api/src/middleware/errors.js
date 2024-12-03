import { reportError } from '../error-reply.js';

export const ERROR_CODES = {
  MalformedPayload: 400, // Only for JSON.parse() errors
  InvalidRequestArguments: 400, // Only for query and param validation errors
  InputValidationError: 400, // Only for JSON schema errors
  InputError: 400, // Other input errors (manually coded validation)
  AuthenticationFailed: 401, // Only if authentication failed
  InsufficientScopes: 403, // Only if request had insufficient scopes
  ResourceNotFound: 404, // If the resource wasn't found
  RequestConflict: 409, // If the request conflicts with server state
  ResourceExpired: 410, // If the resource expired over time
  InputTooLarge: 413, // Only if the payload is too big
  InternalServerError: 500, // Only for internal errors
};


/**
 * @typedef {(
 *   code: string,
 *   message: string,
 *   details?: object
 * ) => never} ReportErrorFunction
 */

/**
 * Middleware that adds `res.reportError(code, message, details)`
 */
export const buildReportErrorMethod = () => {
  /**
   * Builds and attaches an error reporting method to the response object
   * @param {import('express').Request} req
   * @param {import('express').Response & { reportError: ReportErrorFunction }} res
   * @param {import('express').NextFunction} next - Express next middleware function
   * @returns {void}
   */
  return (req, res, next) => {
    res.reportError = reportError;
    next();
  };
};
