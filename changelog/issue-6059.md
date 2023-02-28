audience: users
level: major
reference: issue 6059
---

It is now possible to seal a task group which is an operation to prevent additional tasks from being added.

New APIs:

* HTTP API `queue.sealTaskGroup` to seal task group and prevent addition of new tasks to it. This operation is irreversible.
* HTTP API `queue.getTaskGroup` to return task group information without tasks (use `queue.listTaskGroup` to return information with tasks)
* Pulse exchange `exchange/taskcluster-queue/v1/task-group-sealed` reports when a task group is sealed.

Updated APIs:

* HTTP API `queue.createTask` returns HTTP `409` error if task group was sealed.
* HTTP API `queue.listTaskGroup` returns extra fields `schedulerId`, `expires`, `sealed`.
* Pulse exchange `exchange/taskcluster-queue/v1/task-group-resolved` publishes extra fields `schedulerId`, `expires`, `sealed`.

UI updates:

* Task group view displays expiration and sealing time.
* Task group view actions includes seal task group action.
