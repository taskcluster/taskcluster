audience: worker-deployers
level: patch
reference: issue 6130
---
This patch ensures that the worker pool ID passed to generic worker contains a slash (`/`) and will error out describing the issue as opposed to panicing when an `index out of range` error.
