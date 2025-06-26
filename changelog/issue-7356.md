audience: users
level: major
reference: issue 7356
---
Generic Worker multiuser engine on macOS now executes all task commands via a
Launch Agent running in the context of the desktop session. This means that
task commands now have full access to desktop session services, such as the
clipboard.

# Deployment Instructions - macOS

On macOS it is *essential* that after updating the generic-worker binary,
before starting the worker up, that the file `next-task-user.json` is deleted.
This file should only be deleted when upgrading the worker, not every time the
worker runs. This will cause Generic Worker to create new task users, which is
needed for the launch agent to work. Otherwise the new Generic Worker would try
to use task users created by the old Generic Worker user, which would not work.
Note, the full path to this file can be seen in the generic worker logs, if you
are not sure where to find it on the file system.

Note, this only needs to be done once when installing the new version of
Generic Worker. After that, Generic Worker will continue to mange this file
itself as normal.
