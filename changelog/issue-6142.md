audience: admins
level: minor
reference: issue 6142
---

Worker manager stops instances that are not active in queue after short timeout.
This is to prevent instances from running when worker fails to start claiming work or dies and does not reclaims task.
