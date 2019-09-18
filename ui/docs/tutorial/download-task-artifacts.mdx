---
title: Download task artifacts via API
layout: default
class: markdown
followup:
  links:
    '/docs/reference': API documentation for all Taskcluster services
---

Once the task is resolved, we can list artifacts from
runs of the task. A convenience method `queue.listLatestArtifacts` will list
artifacts from the latest run. But you can also specify the exact run to
list artifacts from, or download the status structure to find the latest run.

In the example below we list artifacts from the latest run. `runId` always
starts from zero and the highest `runId` is always the latest. As we don't want to
fetch the task status structure first we use
`queue.listLatestArtifacts(taskId)` instead of
`queue.listArtifacts(taskId, runId)`. Again, no credentials are required to
inspect the list of artifacts.

In the list, we should see artifacts named `public/logs/live.log` and
`public/passwd.txt`. The `public/logs/live.log` contains the task log, and is
streamed live directly from the worker while the task is running. After the
task is completed the `public/logs/live.log` will redirect to a file on S3.
The `public/passwd.txt` is the `/etc/passwd` file as exported from the docker
container after task execution.

In the example below we list all artifacts, constructing URLs from which they
can be downloaded. Then we download the `public/passwd.txt` artifact and
print it.  It should be noted that artifacts prefixed `public/` are public and
downloading them doesn't require any credentials.

```
let taskcluster = require('taskcluster-client');
let request     = require('superagent');

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
    console.log("waiting for completion..");
    let result = await queue.status(taskId);    
    
    if (['completed', 'failed', 'exception'].indexOf(result.status.state) !== -1) {    
      console.log("Task is now resolved...");    
      break;
    }    

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  result = await queue.listLatestArtifacts(taskId);    
  console.log("Artifacts:");
  for (let artifact of result.artifacts) {
    // Build URL for the artifact
    let url = queue.buildUrl(queue.getLatestArtifact, taskId, artifact.name);
    // Print URL for artifact
    console.log(url);
  }

  let url = queue.buildUrl(queue.getLatestArtifact, taskId, 'public/passwd.txt');
  let res = await request.get(url).buffer(true);
  console.log(res.text)
};

runTask().catch(console.error);
```

The auxiliary method `queue.buildUrl` (not an API call) constructs a URL for
the API method given as first parameter with URL parameters given. This is
useful if you want to create a URL that can be passed around to other HTTP
clients.

If the artifact was private (ie. didn't start with `public/`) we could have
constructed the `queue` object with credentials and used the auxiliary method
`queue.buildSignedUrl` which works like `queue.buildUrl`, with the only
difference that includes a signature in the query-string for the URL.
