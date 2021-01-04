audience: developers
level: minor
---
This version removes the unused deployment configuration variable `queue.use_cloud_mirror`.  This was set to false by default, and cloud-mirror has not run for years, so it is unlikely any deployment has this parameter configured.
