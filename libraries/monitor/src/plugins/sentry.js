const Sentry = require('@sentry/node');

const tcToSentryLevel = {
  emerg: 'fatal',
  alert: 'error',
  crit: 'error',
  err: 'error',
  warning: 'warning',
  notice: 'info',
  info: 'info',
  debug: 'debug',
};

class SentryReporter {
  constructor({ dsn, taskclusterVersion, serviceName, processName }) {
    if (!dsn) {
      throw new Error('SentryReporter plugin must have a `dsn` set to work.');
    }
    Sentry.init({
      dsn,
      release: taskclusterVersion,
      autoSessionTracking: false,
    });
    Sentry.configureScope(scope => {
      scope.setTag('service', serviceName);
      scope.setTag('proc', processName);
    });
  }

  report(error, level, extra) {
    Sentry.withScope(scope => {
      if (level) {
        scope.setLevel(tcToSentryLevel[level] || 'error');
      }
      if ('sentryFingerprint' in error) {
        scope.setFingerprint(['{{ default }}', error.sentryFingerprint]);
        delete error.sentryFingerprint;
      }
      if (extra) {
        Object.entries(extra).forEach(([k, v]) => {
          scope.setTag(k, v);
        });
      }
      return Sentry.captureException(error);
    });
  }

  async flush() {
    await Sentry.flush();
  }
}

module.exports = SentryReporter;
