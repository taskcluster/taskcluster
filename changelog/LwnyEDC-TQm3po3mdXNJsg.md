audience: general
level: patch
---
Adjust GCP CloudBuild config to cancel other ongoing jobs, so that the latest job is the only one that runs and no race conditions will occur with deploying to dev.
