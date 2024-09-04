audience: users
level: patch
reference: issue 7233
---
getArtifact now encodes artifact names to return valid URLs even when
the name contains unsafe characters.
