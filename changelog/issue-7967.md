audience: users
level: patch
reference: issue 7967
---
D2G: accounts for image artifacts that may contain multiple tags for the same image, previously causing a worker error: `runtime error: index out of range [1] with length 1`.
