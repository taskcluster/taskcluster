audience: users
level: major
reference: issue 4586
---
The following queue API endpoints no longer support their legacy scopes.
In most of these cases, the legacy scopes are shorter than the still-supported fully-qualified scopes.
* `queue.claimTask` no longer accepts `queue:claim-task`.
* `queue.reclaimTask` no longer accepts `queue:reclaim-task`.
* `queue.reportCompleted` and `queue.reportException` no longer accept `queue:resolve-task`.
* `queue.createArtifact` no longer accepts `queue:create-artifact:<name>`.

Investigations detailed in the linked issue suggest that none of these scopes are actively used.
