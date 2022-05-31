audience: general
level: patch
reference: issue 5459
---
Add exponential backoff retries to the `dockerPush` function to help alleviate intermittent failures in the `release-publish` task.
