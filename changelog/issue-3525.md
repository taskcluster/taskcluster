audience: worker-deployers
level: silent
reference: issue 3525
---
When a docker-worker task is aborted, the chain-of-trust feature will correctly shut down and not log an error.
