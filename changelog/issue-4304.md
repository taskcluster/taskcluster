audience: users
level: patch
reference: issue 4304
---
The queue now better tracks workers, and in particular will not "lose track of" a worker which resumes claiming work a short time after it expires.
