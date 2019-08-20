const Sentry = require('@sentry/node');

class SentryReporter {
  constructor({dsn, taskclusterVersion, serviceName}) {
    Sentry.init({
      dsn,
      release: taskclusterVersion,
    });
    Sentry.configureScope(scope => {
      scope.setTag('service', serviceName);
    });
  }

  report(error) {
    return Sentry.captureException(error);
  }

  async flush() {
    await Sentry.flush();
  }
}

module.exports = SentryReporter;
