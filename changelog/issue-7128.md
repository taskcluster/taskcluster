audience: users
level: patch
reference: issue 7128
---

Generic Worker multiuser engine on Linux now uses `/usr/sbin/deluser --remove-home` instead of `/usr/sbin/deluser --remove-all-files` when deleting previous task users. This ensures that caches that may still be owned (in whole or in part) by the task user are not deleted.
