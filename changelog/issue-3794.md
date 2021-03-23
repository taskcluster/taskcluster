audience: users
level: patch
reference: issue 3794
---
The worker manager no longer considers quarantined users in its definition of existing capacity. If necessary, it will provision new workers for any pending tasks as if the quarantined worker did not exist.
