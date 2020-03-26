audience: developers
level: patch
reference: issue 2555
---
The azure-queue emulation library now omits expired messages from its counts.  The visible effect is that pending counts for queues no longer include tasks past their deadline.
