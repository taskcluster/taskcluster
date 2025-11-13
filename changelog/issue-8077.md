audience: worker-deployers
level: patch
reference: issue 8077
---

Azure provider reports ARM template deployments errors on the worker pool level.
When deployment fails and one or more resources were not created, errors were hidden in operations list,
which made it difficult to debug.
