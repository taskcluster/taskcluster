audience: worker-deployers
level: patch
reference: issue 9364
---
Generic Worker (multiuser, macOS, non-headless) now gives each task user the lowest free UID from 502 and a GeneratedUID derived from it, removing that GeneratedUID from any group it was left in. Per-user macOS state keyed by the GeneratedUID, such as `usermanagerd` persona records in `/private/var/db/keybags/persona.kb`, is then reused by later task users instead of growing by one record per task. Headless task users are created as before.
