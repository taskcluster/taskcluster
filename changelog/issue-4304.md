audience: users
level: patch
reference: issue 4304
---
The queue now better tracks workers.  In particular, it will not "lose track of" a worker which resumes claiming work a short time after it expires, and workers will not immediately expire after being un-quarantined.
