audience: worker-deployers
level: major
---
The Generic Worker insecure engine has been removed. The multiuser engine is now
the only engine, eliminating the need for build tags (`-tags multiuser` /
`-tags insecure`) when building, testing, or linting. Workers previously using the
insecure engine should switch to the multiuser engine with `headlessTasks: true`
for equivalent non-reboot behavior.

Release artifact names have changed: the engine name has been dropped from binary
names. For example, `generic-worker-multiuser-linux-amd64` is now
`generic-worker-linux-amd64`. Update any deployment scripts or download URLs that
reference the old naming convention.
