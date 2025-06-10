audience: deployers
level: patch
reference: issue 7763
---

Helm chart forces metrics-only deployments to have `replicas: 0` if `prometheus.enabled` is `false`
