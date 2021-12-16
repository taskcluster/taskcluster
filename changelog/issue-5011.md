audience: worker-deployers
level: patch
reference: issue 5011
---
In worker-runner, the static provider is incompatible with cacheOverRestarts.  The tool now produces more useful error messages in this situaiton.

Worker-runner also fails with a useful error message if its credentials are too old on startup, as might happen if a worker restart takes too long.
