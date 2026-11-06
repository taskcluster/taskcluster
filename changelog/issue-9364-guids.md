audience: worker-deployers
level: patch
reference: issue 9364
---
Generic Worker (multiuser, macOS) now gives each task user the lowest free UID from 502 and a GeneratedUID derived from it, so per-user macOS state keyed by the GeneratedUID, such as `usermanagerd` persona records in `/private/var/db/keybags/persona.kb`, is reused by later task users instead of growing by one record per task.
