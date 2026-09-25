audience: users
level: patch
---
Generic Worker now writes mounted content through the task directory without following symbolic links out of it. A mount whose path passes through a link leaving the task directory (for example one left in a writable cache by an earlier task) now fails the task instead of writing elsewhere.
