audience: users
level: patch
reference: issue 7132
---
Bug fix: Generic Worker multiuser on Linux/macOS was previously executing task
commands as processes that did not include the supplementary groups of the task
user, only its primary group. Until upgrading from Ubuntu 22.04 to Ubuntu 24.04
task users did not have supplementary groups, so this had no negative
consequences. However, `/usr/sbin/adduser` on Ubuntu 24.04 by default gives
newly generated users the supplementary group `users`, which introduced a
discrepency between the groups that the task command process was in, and the
groups that the user was in.  Generic Worker multiuser on Linux and macOS now
ensures that the launched processes of task commands are given not only the
primary group of the task user, but also any supplementary groups that it has.
