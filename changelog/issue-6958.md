audience: general
level: patch
reference: issue 6958
---
Worker Manager now only applies GCP disk labels to `PERSISTENT` disk types.

This fixes an issue in v64.2.2 where `initializeParams.labels` was being set on all disk types and caused GCP to error on local SSDs (`SCRATCH` type disks).
