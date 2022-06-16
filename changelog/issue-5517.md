audience: users
level: patch
reference: issue 5517
---
This patch fixes the quarantined value on the workers table to be `n/a` if the quarantined value is in the past. This issue was first noticed in v44.16.3.
