audience: users
level: major
reference: issue 7082
---
This change comprises three elements:

1. D2G now executes tasks under `docker` rather than `podman` if the Docker
   Worker task has the `privileged` capability enabled. This should result in
   fewer tasks failing due to differences in default behaviour between docker
   and podman privileged containers.
2. D2G generated task scopes are now sorted.
3. A bug has been fixed where D2G was granting scopes to generated tasks
   based on the declared capabilities of the Docker Worker task it was
   converting, rather than deriving the target Generic Worker scopes solely
   from the original Docker Worker task scopes. This allowed a task with
   insufficient scopes under Docker Worker to gain elevated privileges under
   Generic Worker.
