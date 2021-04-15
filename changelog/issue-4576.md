audience: users
level: patch
reference: issue 4576
---
The shell client now has two new commands to download data from Taskcluster:
 * `taskcluster download object <name> <filename>` -- download directly from the object service
 * `taskcluster download artifact <taskId> [<runId>] <name> <filename>` -- download the content of an artifact
These commands follow current best practices, including retries with backoff.  When supported by the object service, they will also verify download integrity.
