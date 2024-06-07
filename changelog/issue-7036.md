audience: deployers
level: major
reference: issue 7036
---

Secrets are being introduced in services configuration. All sensitive values that are marked as secrets would be deployed in kubernetes as Secrets (as they used to be).
All non-sensitive values would be stored inside ConfigMap resources.
Deployments and CronJobs would fetch values from both secrets and configuration maps.
