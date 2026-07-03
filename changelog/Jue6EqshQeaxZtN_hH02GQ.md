audience: worker-deployers
level: patch
---
The Google provider in worker-manager now logs a single transient GCP compute 5xx at `notice` rather than `warning` level.
