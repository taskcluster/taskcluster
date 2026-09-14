audience: developers
level: patch
reference: issue 3665
---
Service and library tests now allocate ephemeral ports via `testing.getFreePort()`, avoiding intermittent `EADDRINUSE` failures when multiple suites start HTTP servers.
