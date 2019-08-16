const SentryReporter = require('./sentry');
const TestReporter = require('./testreporter');

module.exports = {
  errorPlugins: {
    SentryReporter,
    TestReporter,
  },
};
