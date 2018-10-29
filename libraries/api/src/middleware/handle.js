const assert = require('assert');

/**
 * Handle API end-point request
 *
 * This invokes the handler with `context` as `this` and then catches
 * exceptions and failures of returned promises handler.
 */
const callHandler = ({entry, context, monitor}) => {
  assert(entry.handler, 'No handler is provided');
  return (req, res) => {
    Promise.resolve(null).then(() => {
      return entry.handler.call(context, req, res);
    }).then(() => {
      if (!req.hasAuthed) {
        // Note: This will not fail the request since a response has already
        // been sent at this point. It will report to sentry however!
        // This is only to catch the case where people do not use res.reply()
        if (monitor) {
          monitor.reportError(`${entry.name}: req.authorize was never called, ` +
            'or some parameters were missing from the request', {
              url: req.originalUrl,
              method: req.method,
              requestId: req.get('x-request-id'),
            });
        }
      }
    }).catch((err) => {
      if (err.code === 'AuthorizationError') {
        return res.reportError('InsufficientScopes', err.messageTemplate, err.details);
      } else if (err.code === 'AuthenticationError') {
        return res.reportError('AuthenticationFailed', err.message, err.details);
      }
      return res.reportInternalError(err);
    });
  };
};

exports.callHandler = callHandler;
