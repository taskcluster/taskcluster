audience: users
level: patch
reference: issue 6476
---
Generic Worker now checks the Index to see if there is a new version of an Indexed Artifact available. If there isn't, it is fine to use its cached copy, but if there is, it updates its cache.
