audience: worker-deployers
level: patch
reference: issue 8115
---
Generic Worker (windows): uses `SysProcAttr.HideWindow` flag and `CREATE_NEW_CONSOLE` over `CREATE_NO_WINDOW` so that child processes can call `AllocConsole()` to create new consoles.
