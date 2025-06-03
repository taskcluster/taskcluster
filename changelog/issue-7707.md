audience: deployers
level: minor
reference: issue 7707
---

Adds Prometheus metrics support to the monitor via a new plugin. Metrics can now be registered using `MonitorManager.registerMetric()`, similar to log types. When enabled, each configured service and background job starts a separate server on port `9100` to expose metrics for Prometheus scraping.

Example minimal Kubernetes `values.yml` configuration:
```yaml
prometheus:
  enabled: true
  prefix: tc
  server:
    ip: 0.0.0.0
    port: 9100
```

If your cluster does not support the `monitoring.googleapis.com/v1/PodMonitoring` resource, add `"podmonitoring"` to `.skipResourceTypes[]` to prevent deployment failures.
