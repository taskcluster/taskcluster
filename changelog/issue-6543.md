audience: general
level: patch
reference: issue 6543
---
Generic Worker: d2g no longer passes the environment variable values to the `podman run` command. Instead, just the variable name is passed as `-e VAR` which tells podman to take the value from the host. This will tidy up the run command and will help with any escaping issues users may have been having.
