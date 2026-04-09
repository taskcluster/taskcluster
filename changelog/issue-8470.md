audience: deployers
level: patch
reference: issue 8470
---
Worker Manager: fix a race condition where concurrent worker scanners could reset each other's tracking state via scanPrepare, causing a TypeError in the Azure provider's checkWorker. Each scanner now only calls scanPrepare/scanCleanup on the providers it is responsible for.
