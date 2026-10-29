audience: worker-deployers
level: patch
reference: issue 9364
---
Generic Worker (multiuser, macOS) now removes records of deleted task users from `/private/var/db/keybags/persona.kb`, which otherwise grows by one record per task until `usermanagerd` exceeds its memory limit and task user logins hang.
