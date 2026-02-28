audience: worker-deployers
level: major
---
The Generic Worker insecure engine has been removed. The multiuser engine is now
the only engine, eliminating the need for build tags (`-tags multiuser` /
`-tags insecure`) when building, testing, or linting. Workers previously using the
insecure engine should switch to the multiuser engine with `headlessTasks: true`
for equivalent non-reboot behavior.
