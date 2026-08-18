audience: users
level: patch
---
The JS clients now throw an error if `authorizedScopes` is passed as anything
but an array (or `null`) instead of outright ignoring it in that case.
