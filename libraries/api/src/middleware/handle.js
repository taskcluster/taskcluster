import assert from 'assert';

/**
 * Handle API end-point request
 *
 * This invokes the handler with `context` as `this` and then catches
 * exceptions and failures of returned promises handler.
 *
 * @template {Record<string, any>} TContext
 * @param {{
 *   entry: import('../../@types/index.d.ts').APIEntryOptions<TContext>,
 *   context: Record<string, any>,
 *   monitor: import('taskcluster-lib-monitor').Monitor
 * }} options
 * @returns {import('../../@types/index.d.ts').APIRequestHandler<TContext>}
 */
export const callHandler = ({ entry, context, monitor }) => {
  assert(entry.handler, 'No handler is provided');
  return (req, res, next) => {
    Promise.resolve(null).then(() => {
      // @ts-ignore - we check this above already
      return entry.handler.call(req.tcContext, req, res);
    }).then(() => {
      if (!req.public && !req.satisfyingScopes) {
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
