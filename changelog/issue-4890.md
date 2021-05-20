audience: users
level: patch
reference: issue 4890
---
This version fixes a bug in the rust client where API methods with method POST but without a request payload would result in 411 errors due to a missing Content-Length header.
