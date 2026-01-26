audience: deployers
level: patch
---
Adds `securityContext.runAsNonRoot: true` and `securityContext.allowPrivilegeEscalation: false` to all k8s Deployments and CronJobs.
