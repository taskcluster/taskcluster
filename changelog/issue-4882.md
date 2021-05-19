audience: deployers
level: patch
reference: issue 4882
---
Taskcluster-lib-pulse now supports connections to servers that use SNI, such as up-to-date CloudAMQP clusters using a custom certificate.  It does so by passing an explicit `servername` socket option.
