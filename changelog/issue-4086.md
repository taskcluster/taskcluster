audience: users
level: patch
reference: issue 4086
---
`queue.getArtifact()` checks if artifact is expired and returns `ResourceExpired - 410` in such cases
