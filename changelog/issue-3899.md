audience: users
level: patch
reference: issue 3899
---
Docker-worker now decompresses downloaded images when they have a compressed content-encoding, as artifacts produced by docker-worker now have.
