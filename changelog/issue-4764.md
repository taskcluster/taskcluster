audience: users
level: patch
reference: issue 4764
---
The Python client now has `downloadArtifact`, `downloadArtifactToBuf`, and `downloadArtifactToFile` functions which will download an artifact regardless of its storage type, applying retries and other best practices.
