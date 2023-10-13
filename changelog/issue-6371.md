audience: users
level: minor
reference: issue 6371
---
D2G tool now can convert an entire Docker Worker task definition to a Generic Worker task definition.

New `taskcluster d2g -h` output:

```bash
Converts a docker-worker payload (JSON) to a generic-worker payload (JSON).
To convert a task definition (JSON), you must use the task definition flag (-t, --task-def).

Usage:
  taskcluster d2g [flags]

Examples:
  taskcluster d2g -f /path/to/input/payload.json
  taskcluster d2g -t -f /path/to/input/task-definition.json
  cat /path/to/input/payload.json | taskcluster d2g
  cat /path/to/input/task-definition.json | taskcluster d2g -t
  echo '{"image": "ubuntu", "command": ["bash", "-c", "echo hello world"], "maxRunTime": 300}' | taskcluster d2g

Flags:
  -f, --file string   Path to a .json file containing a docker-worker payload or task definition.
  -h, --help          help for d2g
  -t, --task-def      Must use if the input is a docker-worker task definition.

Global Flags:
  -v, --verbose   verbose output
```
