audience: users
level: patch
reference: issue 7599
---
D2G now generates a payload that initially sends SIGTERM to the docker run
command rather than SIGKILL in the event of max run time being reached.

This allows cleaner termination, and also changes the exit code of the failed
task from 137 to 143, which allows differentiating it from e.g. OOM errors.
