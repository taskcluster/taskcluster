audience: worker-deployers
level: minor
reference: issue 8012
---
Generic Worker (windows): adds `task.payload.features.hideCmdWindow` [default: `false`] to hide the `cmd.exe` window that appears during task execution. This may be useful if the `cmd.exe` window gets in the way of GUI applications while running tasks. Please note: if your task needs to allocate new consoles (with `AllocConsole()`, for example), it will not be able to if you set this to `true`.
