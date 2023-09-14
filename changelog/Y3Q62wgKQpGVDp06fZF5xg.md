audience: general
level: patch
---
D2G now takes advantage of Generic Worker Indexed Artifacts, introduced in Generic Worker 51.0.0. D2G translates Indexed Docker Images into Generic Worker mounted Indexed Artifacts. Previously, D2G generated commands to query the taskcluster Index and fetch the docker image.
With this improvement, docker images are now cached on workers, docker image dependencies between tasks are declarative (and thus inspectable), and generated Generic Worker task payloads are simpler and easier to understand.
