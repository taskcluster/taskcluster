audience: deployers
level: patch
---
Adds `securityContext.runAsNonRoot: true` and `securityContext.allowPrivilegeEscalation: false` to all k8s Deployments and CronJobs. Containers are all now run as non-root, `node` user (UID/GID 1000).
