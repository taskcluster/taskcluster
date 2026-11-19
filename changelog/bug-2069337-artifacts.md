audience: users
level: patch
reference: bug 2069337
---
D2G: a task loading a docker image artifact can no longer resolve the image ID of another image that a concurrent task loads or pulls with the same tag.
