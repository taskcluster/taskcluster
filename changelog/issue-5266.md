audience: general
level: patch
reference: issue 5266
---
This patch fetches `https://go.dev/dl/?mode=json` in order to automatically update the sha256 values of each of the go binaries used in the `workers/generic-worker/gw-decision-task/tasks.yml` file.
