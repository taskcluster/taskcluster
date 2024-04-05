audience: worker-deployers
level: patch
reference: issue 6900
---
Worker Runner on Azure no longer sends a `graceful-termination` message if the scheduled event type is `Freeze`. It will continue to send the message for all other event types: `Reboot`, `Redeploy`, `Preempt`, and `Terminate`.
