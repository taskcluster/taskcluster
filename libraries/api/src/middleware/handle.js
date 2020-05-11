const assert = require('assert');

/**
 * Handle API end-point request
 *
 * This invokes the handler with `context` as `this` and then catches
 * exceptions and failures of returned promises handler.
 */
const callHandler = ({entry, context, monitor}) => {
  assert(entry.handler, 'No handler is provided');
  return (req, res, next) => {
    Promise.resolve(null).then(() => {
      return entry.handler.call(req.tcContext, req, res);
    }).then(() => {
      if (!req.public && !req.hasAuthed) {
        // Note: This will not fail the request since a response has already
        // been sent at this point. It will report to sentry however!
        // This is only to catch the case where people do not use res.reply()
        monitor.reportError(`${entry.name}: req.authorize was never called, ` +
          'or some parameters were missing from the request', {
          url: req.originalUrl,
          method: req.method,
          traceId: req.traceId,
        });
      }
    }).catch((err) => {
      return next(err);
    });
  };
};

exports.callHandler = callHandler;
