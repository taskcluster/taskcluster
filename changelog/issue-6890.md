audience: users
level: patch
reference: issue 6890
---
D2G now always passes `--privileged` to the generated `podman run` command.
Without this option, some tasks that ran successfully under Docker Worker,
including tasks without Docker Worker capabilities, would not run correctly
under Generic Worker. Please note, this only elevates the privileges inside the
podman container, which runs as the task user on the host. The privileges
inside the container are still limited to the host privileges of the task user.
