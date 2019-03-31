---
title: Guarded Services
order: 50
---

The auth service has API end-points for delegating access to some guarded service such as AWS S3, or Azure Table Storage.
This functionality is designed for use within the Taskcluster deployment, to delegate limited access to other Taskcluster microservices.

In particular the S3 bucket access is limited to buckets in a single AWS account, and the service's AWS credentials must be granted access to that bucket.
It is not an especially flexible mechanism for granting access to S3 buckets, and we recommend [using AWS credentials in the secret service](/docs/manual/using/s3-uploads) to access S3 buckets from tasks.
