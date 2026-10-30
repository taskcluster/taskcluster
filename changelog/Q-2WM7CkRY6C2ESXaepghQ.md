audience: admins
level: patch
---
Worker-pool errors for failed Azure ARM deployments now carry the error code of the failing deployment operation, such as `QuotaExceeded`. They previously carried the generic `DeploymentFailed` code, which hid the cause in worker-pool error statistics. Existing records keep their old codes.
