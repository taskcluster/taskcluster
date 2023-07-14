audience: users
level: minor
reference: issue 6405
---

Expire artifacts supports both bulk deletion and single deletion. This can be configured for the deployment using `AWS_USE_BULK_DELETE` environment variable (`false` by default). This is needed because not all S3 compatible storages support bulk delete, specifically [GCS](https://cloud.google.com/storage/docs/migrating#methods-comparison).
