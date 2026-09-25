audience: users
level: major
---
Generic Worker now requires `mounts` paths (properties `directory` and `file`) to be relative paths that stay inside the task directory. Tasks with absolute mount paths, or relative paths that escape the task directory (e.g. `../foo`), resolve as `exception/malformed-payload`.
