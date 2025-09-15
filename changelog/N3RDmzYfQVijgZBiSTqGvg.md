audience: users
level: patch
---
D2G: don't write env vars out to Generic Worker's environment. Instead, pass them as `-e <name>=<value>`. Follow-up to https://github.com/taskcluster/taskcluster/pull/7945#discussion_r2348906304.
