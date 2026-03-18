import PrometheusPlugin from './prometheus.js';
import SentryReporter from './sentry.js';
import TestReporter from './testreporter.js';

export default {
  errorPlugins: {
    SentryReporter,
    TestReporter,
  },
  metricsPlugins: {
    PrometheusPlugin,
  },
};
