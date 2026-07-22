level: minor
audience: worker-deployers
---
Worker-runner can now wait for Windows Sysprep and OOBE to complete before it
registers with worker-manager or starts the worker. Set
`waitForWindowsImageState: true` in the runner configuration to prevent tasks
from being claimed before a first-launch OOBE reboot.