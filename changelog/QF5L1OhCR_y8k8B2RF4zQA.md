level: patch
---
The linux-arm builds of generic-worker are now considered [Tier-2](https://docs.taskcluster.net/docs/reference/workers/generic-worker/support-tiers), meaning that they are not tested in CI (but are still built).  Testing is also disabled on Windows 10 / amd64 due to lack of capacity, but continues for Windows 2012 / amd64 so Windows / amd64 remains a tier-1 platform.
