level: minor
audience: deployers
---
The Helm chart now supports annotations on Taskcluster workload pods. Use the global `podAnnotations` map for every Deployment and CronJob pod. A service process's `podAnnotations` map is merged with the global map for that workload, with process values taking precedence for matching keys.
