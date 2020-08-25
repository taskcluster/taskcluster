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
    });
    Sentry.configureScope(scope => {
      scope.setTag('service', serviceName);
      scope.setTag('proc', processName);
    });
  }

  report(error, level, extra) {
    Sentry.configureScope(scope => {
      if (level) {
        scope.setLevel(tcToSentryLevel[level] || 'error');
      }
      if (extra) {
        Object.entries(extra).forEach(([k, v]) => {
          scope.setTag(k, v);
        });
      }
    });
    return Sentry.captureException(error);
  }

  async flush() {
    await Sentry.flush();
  }
}

module.exports = SentryReporter;
