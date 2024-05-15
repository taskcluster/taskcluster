audience: worker-deployers
level: major
reference: issue 7017
---
Generic Worker multiuser engine now places task directories under `/home`
(Linux and FreeBSD) and `/Users` on macOS. Previously it was placing them under
`/` by default on all three platforms, unless either `HOME` was set to a
non-standard value in the process launching Generic Worker multiuser engine, or
if `tasksDir` was explicitly set in Generic Worker config.

This is a bug fix, but due to being a significant change in behaviour, is being
released as a major change to trigger a major version bump.
