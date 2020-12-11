audience: deployers
level: patch
reference: issue 4034
---
The queue's artifact expiration crontask now uses a much more efficient query and should be able to keep up with the load.
