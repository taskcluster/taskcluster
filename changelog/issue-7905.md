audience: worker-deployers
level: patch
reference: issue 7905
---
Generic Worker launch agent on macOS for multiuser engine was crashing due to a bug in the launch daemon that was garbage collecting file handles while the agent was using them. This resulted in the launch agent crashing. This has been fixed by keeping file handles alive in the daemon.
