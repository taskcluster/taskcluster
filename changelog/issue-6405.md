audience: admins
level: patch
reference: issue 6405
---

Expire artifacts handles the case where the artifact is not found during deletion. GCS behaves differently to S3 here, as it will throw an error if the artifact is not found, where S3 would always return 204.
