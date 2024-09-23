audience: users
level: patch
reference: issue 7255
---
D2G now passes `--init` to the `podman run`/`docker run` command it generates,
in order that signals are properly received and processed by the container.
