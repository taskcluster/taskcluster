import SentryReporter from './sentry';
import TestReporter from './testreporter';

export default {
  errorPlugins: {
    SentryReporter,
    TestReporter,
  },
};
