audience: users
level: major
reference: issue 7356
---
Generic Worker multiuser engine on macOS now executes all task commands via a
Launch Agent running in the context of the desktop session. This means that
task commands now have full access to desktop session services, such as the
clipboard.
