audience: users
level: patch
reference: issue 6864
---
D2G now passes `--privileged` flag to the generated `podman run` command when
Docker Worker payload enables device capability `hostSharedMemory`.  Without
this option, the podman container could not successfully access the shared
memory, despite the inclusion of argument `--device=/dev/shm`. With both
arguments present (`--privileged` and `--device=/dev/shm`), shared memory now
appears to be available inside the podman container.
