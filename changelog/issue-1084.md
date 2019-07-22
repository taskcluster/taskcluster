level: minor
reference: issue 1084
---

The Dockerfile for the Taskcluster services is now checked-in rather than
generated at build time. It has been reordered so that changes to things
other than package.json won't re-install packages.
