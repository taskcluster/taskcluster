import SentryReporter from './sentry.js';
import TestReporter from './testreporter.js';
import PrometheusPlugin from './prometheus.js';

export default {
  errorPlugins: {
    SentryReporter,
    TestReporter,
  },
  metricsPlugins: {
    PrometheusPlugin,
  },
};
