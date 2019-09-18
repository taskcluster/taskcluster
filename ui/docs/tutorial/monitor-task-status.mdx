---
title: Monitor task status via API
layout: default
class: markdown
followup:
  links:
    download-task-artifacts: Download task artifacts via API
---
import SchemaTable from 'taskcluster-ui/components/SchemaTable'

Holding the `taskId` to a task, we can fetch the task status, using the
`queue.status(taskId)` API end-point. This returns an object where the `status`
property is the _task status structure_. This structure is commonly used to
represent the status of a task in both API calls and pulse messages.
Below is the JSON schema for the response from the `queue.status(taskId)`
API end-point.

<SchemaTable schema="/schemas/queue/v1/task-status-response.json" />

In the following example we expand `runTask` to use the `queue.status(taskId)`
API endpoint to fetch status for the task created earlier. Notice that
inspecting a task doesn't require any credentials, you just need the `taskId`.
We generally allow users to inspect metadata without any credentials, which
lets you easily create custom dashboards and other useful tools.

```
let taskcluster = require('taskcluster-client');

let payload = {
  image:            'ubuntu:latest',
  command:          ['/bin/bash', '-c', 'ls && du /usr'],
  maxRunTime:       600,
  artifacts: {
    "public/passwd.txt": {
      type:         'file',
      path:         '/etc/passwd',
      expires:      taskcluster.fromNowJSON('2 months')
    }
  }
};

let task = {
  provisionerId:      'aws-provisioner-v1',
  workerType:         'tutorial',
  created:            taskcluster.fromNowJSON('0 seconds'),
  deadline:           taskcluster.fromNowJSON('2 days 3 hours'),
  metadata: {
    name:             "Tutorial **Example** Task",
    description:      "Task create from _interactive_ tutorials",
    owner:            'nobody@taskcluster.net',
    source:           "https://docs.taskcluster.net/tutorial/create-task-via-api",
  },
  payload:            payload,
};


let runTask = async () => {
  let taskId = taskcluster.slugid();
  let queue = new taskcluster.Queue();
  let result = await queue.createTask(taskId, task);

  console.log("Created task:\n" + JSON.stringify(result.status, null, 2));
  console.log("Inspect it at:");
  console.log("https://tc.example.com/tasks/" + taskId);

  while (1) {
    let result = await queue.status(taskId);

    console.log("\nTask status structure:");
    console.log(JSON.stringify(result.status, null, 2));

    if (['completed', 'failed', 'exception'].indexOf(result.status.state) !== -1) {
      console.log("Task is now resolved...");
      break;
    }

    // wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
};

runTask().catch(console.error);
```

You may notice that the _task status structure_ has a list of runs. Each run
have a `reasonCreated` and once resolved a `reasonResolved`. A run cannot
change state once resolved, but a task may have additional runs until
`task.deadline` is reached.

The queue creates additional runs, if a run fails because a worker became
unresponsive or reported a shutdown, for example if a node crashes or a
EC2 spot-node is terminated. In this case the task will be _retried_ at most
`task.retries` times. If you don't want your task to be retried you can set
`task.retries` to zero. Users can also _rerun_ a resolved task using
`queue.rerunTask(taskId)`, this is generally not recommended, especially not if
relying on another service for scheduling dependent tasks.

You should note the difference in terminology between:
 * **retry task**, which happens in case of infrastructure failure, and,
 * **rerun task**, which happens if explicitly requested by a caller.
The distinction is important as a task that is automatically _retried_ won't
cause a task exception message to published on pulse. Whereas a message
signaling that the task is resolved will be published on pulse before
calling `task.rerunTask(taskId)` as any effect.
