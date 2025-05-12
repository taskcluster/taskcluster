audience: deployers
level: major
reference: issue 7287
---

Helm chart includes HorizontalPodAutoscaler for all web services which is not enabled by default.
Can be enabled per-service, and when enabled, deployment's "replicas" field will be ignored.
