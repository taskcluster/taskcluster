audience: deployers
level: patch
reference: issue 4655
---
Since #4586 landed, the built-in-workers service has failed to resolve tasks due to using the wrong credentials.  This issue has been fixed, and no released version of Taskcluster had this bug.
