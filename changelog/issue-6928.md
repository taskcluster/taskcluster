audience: users
level: patch
reference: issue 6928
---
D2G no longer adds `--cap-add=SYS_PTRACE` for the docker worker `allowPtrace` feature since all capabilities are already added with the `--privileged` flag being passed to all D2G commands as of #6890.
