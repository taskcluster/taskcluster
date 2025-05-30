audience: deployers
level: minor
reference: issue 7707
---

Introduces prometheus metrics to the monitor and exposes few runtime queue metrics.
Prometheus is now a monitor plugin that can be used to expose metrics.
Metrics are registered similarly to the log types with `MonitorManager.registerMetric()`
Configured services and background job would run a separate server on `:9100` port to expose metrics for scraping.
