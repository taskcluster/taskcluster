audience: worker-deployers
level: patch
reference: issue 8115
---
Generic Worker (windows): reverts #8030 to use `CREATE_NEW_CONSOLE` over `CREATE_NO_WINDOW` so that child processes can call `AllocConsole()` to create new consoles.
