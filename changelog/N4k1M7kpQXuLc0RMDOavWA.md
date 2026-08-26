audience: developers
level: silent
---
Generic Worker: writable directory cache `Mount` no longer tracks `cacheMutex` ownership with a side boolean in its panic recover path. Acquire/create runs under a lock that is always released on return, and recover always takes the lock after that.
