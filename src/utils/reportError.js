import { withScope, captureException } from '@sentry/browser';

/**
 * Report errors to sentry.
 * @param error: An error object
 * @param errorInfo:  An object with extra information to send.
 */
export default (error, errorInfo) => {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  withScope(scope => {
    if (errorInfo) {
      Object.keys(errorInfo).forEach(key => {
        scope.setExtra(key, errorInfo[key]);
      });
    }

    captureException(error);
  });
};
