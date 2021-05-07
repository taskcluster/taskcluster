audience: users
level: patch
reference: issue 4764
---
The JS and Pytho clients now have `downloadArtifact*` functions which will download an artifact regardless of its storage type, applying retries and other best practices.
