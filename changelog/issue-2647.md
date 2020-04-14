audience: worker-deployers
level: minor
reference: issue 2647
---
The Taskcluster livelog tool has been merged into the Taskcluster monorepo, and will now be released in concert with the rest of Taskcluster.  In the process of merging this tool, it was discovered that it handled HTTP Range requests incorrectly.  On the assumption that this functionality was never used, it has been removed.
