audience: users
level: patch
reference: issue 6516
---
Generic Worker now handles Indexed Docker Images where the docker image
contains multiple tags. Previously, Generic Worker assumed that indexed docker
images would have only one tag.
