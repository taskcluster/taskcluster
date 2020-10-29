audience: developers
level: patch
reference: issue 3502
---
A bug where `authenticateHawk` calls would occasionally return an invalid response has been fixed. This issue impacted
reliability but not security.