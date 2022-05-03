audience: users
level: patch
reference: issue 5412
---
Docker-worker no longer accepts and ignores arbitrary properties in task payloads. It now only accepts properties defined in its payload schema.
