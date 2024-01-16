audience: worker-deployers
level: patch
reference: issue 6779
---
Interactive feature data race fixed, whereby an error could cause a concurrent read and write of process state in different go routines.
