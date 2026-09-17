audience: developers
level: silent
---
Generic Worker on Windows adds the task user to `Remote Desktop Users` with `NetLocalGroupAddMembers` instead of `Add-LocalGroupMember` via PowerShell.
