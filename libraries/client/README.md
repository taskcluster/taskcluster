# TaskCluster Client
_A taskcluster client library for node.js._

## Usage
This client library is generated from the auto-generated API reference.
You can load these at runtime using `client.load`, but there is also a series
of builtin APIs. You can use them as follows:

```js
var client = require('taskcluster-client');

// Create task using `queue` (builtin API)
client.queue.createTask(task).then(function(result) {
  // status is a task status structure
  console.log(result.status);
});
```

The `payload` parameter is always a JSON object as documented by the REST API
documentation. The methods always returns a _promise_ for the response JSON
object as documented in the REST API documentation.

<!-- START OF GENERATED DOCS -->

### Methods in `client.queue`
 * `createTask(payload)`
 * `defineTasks(payload)`
 * `scheduleTask(taskId)`
 * `claimTask(taskId, payload)`
 * `requestArtifactUrls(taskId, payload)`
 * `reportTaskCompleted(taskId, payload)`
 * `claimWork(provisionerId, workerType, payload)`
 * `rerunTask(taskId)`
 * `getPendingTasks(provisionerId)`
 * `getAMQPConnectionString()`

### Methods in `client.scheduler`
 * `createTaskGraph(payload)`
 * `requestTableAccess()`
 * `getTaskGraphStatus(taskGraphId)`
 * `getTaskGraphInfo(taskGraphId)`
 * `inspectTaskGraph(taskGraphId)`

<!-- END OF GENERATED DOCS -->

### Loading an API Dynamically
You can load an API dynamically using `client.load(baseUrl, version)`, as
illustrated below:

```js
// Load API from /v1/reference from queue.taskcluster.net
client.load('http://queue.taskcluster.net', 1).then(function(queue) {
  // Create a task using queue API as created above
  return queue.createTask(task);
}).then(...);
```
If you have the reference locally, you can also create an API wrapper with
`new client(baseUrl, reference)`, where `reference` is the JSON list returned
from `/v1/reference`.

### Configuring API BaseUrls
If you use the builtin APIs documented above you can configure which `baseUrl`
to use using `client.config({queue: 'http://localhost:3001'})`. If no `baseUrl`
is configured this way, the builtin `baseUrl` will be used.

## Updating Builtin APIs
When releasing a new version of the `taskcluster-client` library, we should
always update the builtin references using `utils/update-apis.js` this
maintenance script can be used to list, show, add, remove and update builtin
API definitions.

When `apis.json` is updated, please run `utils/generate-docs.js` to update the
documentation in this file.

##License
The taskcluster client library is released on [MPL 2.0](http://mozilla.org/MPL/2.0/).
