const Sentry = require('@sentry/node');

class SentryReporter {
  constructor({dsn}) {
    Sentry.init({
      dsn,
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
