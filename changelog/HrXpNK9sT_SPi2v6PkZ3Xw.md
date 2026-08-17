audience: users
level: patch
---
Properly report errors from d2g when a docker image has an invalid name rather
than letting docker fail on it and reporting those errors.
