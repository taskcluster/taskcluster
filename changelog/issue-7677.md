audience: deployers
level: patch
reference: issue 7677
---
Worker Manager's `registerWorker` now returns `503` instead of `400` when an Azure worker's intermediate certificate cannot be downloaded, so that workers retry registration instead of failing.
