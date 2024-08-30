audience: worker-deployers
level: patch
reference: issue 7218
---
Generic Worker Multiuser engine on Linux, macOS and FreeBSD now waits for the
required task user to be logged in to the console session, rather than waiting
for any user to be logged in, and then checking whether it is the anticipated
user. This subtle change in behaviour means that temporarily a different user
may be (or appear to be) logged into the console session without causing
Generic Worker to panic. It is hoped that this will reduce intermittent issues
where a different user appears to be logged in (such as gdm user on Linux)
since it is suspected that this might just be a fleeting login that passes due
to some race condition in the start up of the Gnome Desktop.

If this doesn't resolve the issue, and under certain circumstances, the gdm
user instead remains logged in, i.e. it is not a fleeting login, we may need to
restore the previous behaviour, since otherwise when the issue does occur, it
would take a full 5 minutes before timing out, adding to costs unnecessarily.
However, we hope that that will not be the case.
