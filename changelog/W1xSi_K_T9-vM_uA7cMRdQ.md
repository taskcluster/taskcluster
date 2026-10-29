audience: worker-deployers
level: major
reference: bug 1401934
---
The worker will now store reserved artifacts (logs, CoT certificate, rdp.json)
in a directory at `<reservedArtifactsDir>/task_<taskId>_<runId>` instead of in
the task working directory at `generic-worker/`.
