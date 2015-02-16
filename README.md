Taskcluster Client Library in Python
======================================

[![Build Status](https://travis-ci.org/jhford/taskcluster-client.py.svg?branch=master)](https://travis-ci.org/jhford/taskcluster-client.py)

This is a library used to interact with Taskcluster within Python programs.  It
presents the entire REST API to consumers as well as being able to generate
URLs Signed by Hawk credentials.  It can also generate routing keys for
listening to pulse messages from Taskcluster.

The library builds the REST API methods from the same [API Reference
format](http://docs.taskcluster.net/tools/references/index.html) as the
Javascript client library.

'NOTE:' Temporary credentials are implemented, but they don't work from this
library right now

The REST API methods are documented on
[http://docs.taskcluster.net/](http://docs.taskcluster.net/)

* Here's a simple command:

    ```python
    import taskcluster
    index = taskcluster.Index({'credentials': {'clientId': 'id', 'accessToken': 'accessToken'}})
    index.ping()
    ```

* Keyword arguments for API methods are supported.  The javascript client
  accepts only positional arguments.  You may use either positional arguments
  or keyword, never both.  If the method requires an input payload, you must
  specify it as the last positional argument.  If you are using keyword
  arguments, the payload is the first argument.

    ```python
    import taskcluster
    api = taskcluster.api()
    api.method('1', '2', '3', {'data': 'here'})
    ```
    Assuming apiMethod has a route of `/method/<arg1>/<arg2>/<arg3>`,
    this will result in a calle to `/method/pie/2/3`

    The same call can be achieved using keyword arguments of:

    ```python
    import taskcluster
    api = taskcluster.api()
    api.method({'data': 'here'}, arg1='1', arg2='2', arg3='3')
    ```

* Options for the topic exchange methods can be in the form of either a single
  dictionary argument or keyword arguments.  Only one form is allowed

    ```python
    from taskcluster import client
    qEvt = client.QueueEvents()
    # The following calls are equivalent
    qEvt.taskCompleted({'taskId': 'atask'})
    qEvt.taskCompleted(taskId='atask')
    ```

* Method Payloads are specified through the `payload` keyword passed to the API
  method.  When using positional arguments, it's the last argument.  When using
  keyword arguments, the payload is the first and only positional argument

    ```python
    from taskcluster import client
    index = client.index()
    index.listNamespaces('mozilla-central', payload={'continuationToken': 'a_token'})
    ```

There is a bug in the PyHawk library (as of 0.1.3) which breaks bewit
generation for URLs that do not have a query string.  This is being addressed
in [PyHawk PR 27](https://github.com/mozilla/PyHawk/pull/27).

<!-- START OF GENERATED DOCS -->

### Methods in `taskcluster.Index`
```python
// Create Index client instance
import taskcluster
index = taskcluster.Index(options)
```
#### Find Indexed Task
 * `index.findTask(namespace) -> result`
 * `index.findTask(namespace='value') -> result`

#### List Namespaces
 * `index.listNamespaces(namespace, payload) -> result`
 * `index.listNamespaces(payload, namespace='value') -> result`

#### List Tasks
 * `index.listTasks(namespace, payload) -> result`
 * `index.listTasks(payload, namespace='value') -> result`

#### Insert Task into Index
 * `index.insertTask(namespace, payload) -> result`
 * `index.insertTask(payload, namespace='value') -> result`

#### Ping Server
 * `index.ping() -> None`




### Methods in `taskcluster.Auth`
```python
// Create Auth client instance
import taskcluster
auth = taskcluster.Auth(options)
```
#### Get Client Authorized Scopes
 * `auth.scopes(clientId) -> result`
 * `auth.scopes(clientId='value') -> result`

#### Get Client Credentials
 * `auth.getCredentials(clientId) -> result`
 * `auth.getCredentials(clientId='value') -> result`

#### Get Client Information
 * `auth.client(clientId) -> result`
 * `auth.client(clientId='value') -> result`

#### Create Client
 * `auth.createClient(clientId, payload) -> result`
 * `auth.createClient(payload, clientId='value') -> result`

#### Modify Client
 * `auth.modifyClient(clientId, payload) -> result`
 * `auth.modifyClient(payload, clientId='value') -> result`

#### Remove Client
 * `auth.removeClient(clientId) -> None`
 * `auth.removeClient(clientId='value') -> None`

#### Reset Client Credentials
 * `auth.resetCredentials(clientId) -> result`
 * `auth.resetCredentials(clientId='value') -> result`

#### List Clients
 * `auth.listClients() -> result`

#### Get Shared-Access-Signature for Azure Table
 * `auth.azureTableSAS(account, table) -> result`
 * `auth.azureTableSAS(account='value', table='value') -> result`

#### Ping Server
 * `auth.ping() -> None`




### Methods in `taskcluster.Queue`
```python
// Create Queue client instance
import taskcluster
queue = taskcluster.Queue(options)
```
#### Create New Task
 * `queue.createTask(taskId, payload) -> result`
 * `queue.createTask(payload, taskId='value') -> result`

#### Fetch Task
 * `queue.getTask(taskId) -> result`
 * `queue.getTask(taskId='value') -> result`

#### Define Task
 * `queue.defineTask(taskId, payload) -> result`
 * `queue.defineTask(payload, taskId='value') -> result`

#### Schedule Defined Task
 * `queue.scheduleTask(taskId) -> result`
 * `queue.scheduleTask(taskId='value') -> result`

#### Get task status
 * `queue.status(taskId) -> result`
 * `queue.status(taskId='value') -> result`

#### Get Urls to Poll Pending Tasks
 * `queue.pollTaskUrls(provisionerId, workerType) -> result`
 * `queue.pollTaskUrls(provisionerId='value', workerType='value') -> result`

#### Claim task
 * `queue.claimTask(taskId, runId, payload) -> result`
 * `queue.claimTask(payload, taskId='value', runId='value') -> result`

#### Reclaim task
 * `queue.reclaimTask(taskId, runId) -> result`
 * `queue.reclaimTask(taskId='value', runId='value') -> result`

#### Claim work for a worker
 * `queue.claimWork(provisionerId, workerType, payload) -> result`
 * `queue.claimWork(payload, provisionerId='value', workerType='value') -> result`

#### Report Run Completed
 * `queue.reportCompleted(taskId, runId, payload) -> result`
 * `queue.reportCompleted(payload, taskId='value', runId='value') -> result`

#### Report Run Failed
 * `queue.reportFailed(taskId, runId) -> result`
 * `queue.reportFailed(taskId='value', runId='value') -> result`

#### Report Task Exception
 * `queue.reportException(taskId, runId, payload) -> result`
 * `queue.reportException(payload, taskId='value', runId='value') -> result`

#### Rerun a Resolved Task
 * `queue.rerunTask(taskId) -> result`
 * `queue.rerunTask(taskId='value') -> result`

#### Create Artifact
 * `queue.createArtifact(taskId, runId, name, payload) -> result`
 * `queue.createArtifact(payload, taskId='value', runId='value', name='value') -> result`

#### Get Artifact from Run
 * `queue.getArtifact(taskId, runId, name) -> None`
 * `queue.getArtifact(taskId='value', runId='value', name='value') -> None`

#### Get Artifact from Latest Run
 * `queue.getLatestArtifact(taskId, name) -> None`
 * `queue.getLatestArtifact(taskId='value', name='value') -> None`

#### Get Artifacts from Run
 * `queue.listArtifacts(taskId, runId) -> result`
 * `queue.listArtifacts(taskId='value', runId='value') -> result`

#### Get Artifacts from Latest Run
 * `queue.listLatestArtifacts(taskId) -> result`
 * `queue.listLatestArtifacts(taskId='value') -> result`

#### Fetch pending tasks for provisioner
 * `queue.getPendingTasks(provisionerId) -> None`
 * `queue.getPendingTasks(provisionerId='value') -> None`

#### Get Number of Pending Tasks
 * `queue.pendingTaskCount(provisionerId) -> None`
 * `queue.pendingTaskCount(provisionerId='value') -> None`

#### Get Number of Pending Tasks
 * `queue.pendingTasks(provisionerId, workerType) -> None`
 * `queue.pendingTasks(provisionerId='value', workerType='value') -> None`

#### Ping Server
 * `queue.ping() -> None`




### Exchanges in `taskcluster.QueueEvents`
```python
// Create QueueEvents client instance
import taskcluster
queueEvents = taskcluster.QueueEvents(options)
```
#### Task Defined Messages
 * `queueEvents.taskDefined(routingKeyPattern) -> routingKey`
   * routingKeyKind is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * taskId is required  Description: `taskId` for the task this message concerns
   * runId Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * workerGroup Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * workerId Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * provisionerId is required  Description: `provisionerId` this task is targeted at.
   * workerType is required  Description: `workerType` this task must run on.
   * schedulerId is required  Description: `schedulerId` this task was created by.
   * taskGroupId is required  Description: `taskGroupId` this task was created in.
   * reserved Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task Pending Messages
 * `queueEvents.taskPending(routingKeyPattern) -> routingKey`
   * routingKeyKind is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * taskId is required  Description: `taskId` for the task this message concerns
   * runId is required  Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * workerGroup Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * workerId Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * provisionerId is required  Description: `provisionerId` this task is targeted at.
   * workerType is required  Description: `workerType` this task must run on.
   * schedulerId is required  Description: `schedulerId` this task was created by.
   * taskGroupId is required  Description: `taskGroupId` this task was created in.
   * reserved Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task Running Messages
 * `queueEvents.taskRunning(routingKeyPattern) -> routingKey`
   * routingKeyKind is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * taskId is required  Description: `taskId` for the task this message concerns
   * runId is required  Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * workerGroup is required  Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * workerId is required  Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * provisionerId is required  Description: `provisionerId` this task is targeted at.
   * workerType is required  Description: `workerType` this task must run on.
   * schedulerId is required  Description: `schedulerId` this task was created by.
   * taskGroupId is required  Description: `taskGroupId` this task was created in.
   * reserved Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Artifact Creation Messages
 * `queueEvents.artifactCreated(routingKeyPattern) -> routingKey`
   * routingKeyKind is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * taskId is required  Description: `taskId` for the task this message concerns
   * runId is required  Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * workerGroup is required  Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * workerId is required  Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * provisionerId is required  Description: `provisionerId` this task is targeted at.
   * workerType is required  Description: `workerType` this task must run on.
   * schedulerId is required  Description: `schedulerId` this task was created by.
   * taskGroupId is required  Description: `taskGroupId` this task was created in.
   * reserved Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task Completed Messages
 * `queueEvents.taskCompleted(routingKeyPattern) -> routingKey`
   * routingKeyKind is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * taskId is required  Description: `taskId` for the task this message concerns
   * runId is required  Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * workerGroup is required  Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * workerId is required  Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * provisionerId is required  Description: `provisionerId` this task is targeted at.
   * workerType is required  Description: `workerType` this task must run on.
   * schedulerId is required  Description: `schedulerId` this task was created by.
   * taskGroupId is required  Description: `taskGroupId` this task was created in.
   * reserved Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task Failed Messages
 * `queueEvents.taskFailed(routingKeyPattern) -> routingKey`
   * routingKeyKind is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * taskId is required  Description: `taskId` for the task this message concerns
   * runId Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * workerGroup Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * workerId Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * provisionerId is required  Description: `provisionerId` this task is targeted at.
   * workerType is required  Description: `workerType` this task must run on.
   * schedulerId is required  Description: `schedulerId` this task was created by.
   * taskGroupId is required  Description: `taskGroupId` this task was created in.
   * reserved Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task Exception Messages
 * `queueEvents.taskException(routingKeyPattern) -> routingKey`
   * routingKeyKind is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * taskId is required  Description: `taskId` for the task this message concerns
   * runId Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * workerGroup Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * workerId Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * provisionerId is required  Description: `provisionerId` this task is targeted at.
   * workerType is required  Description: `workerType` this task must run on.
   * schedulerId is required  Description: `schedulerId` this task was created by.
   * taskGroupId is required  Description: `taskGroupId` this task was created in.
   * reserved Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.




### Methods in `taskcluster.Scheduler`
```python
// Create Scheduler client instance
import taskcluster
scheduler = taskcluster.Scheduler(options)
```
#### Create new task-graph
 * `scheduler.createTaskGraph(taskGraphId, payload) -> result`
 * `scheduler.createTaskGraph(payload, taskGraphId='value') -> result`

#### Extend existing task-graph
 * `scheduler.extendTaskGraph(taskGraphId, payload) -> result`
 * `scheduler.extendTaskGraph(payload, taskGraphId='value') -> result`

#### Task Graph Status
 * `scheduler.status(taskGraphId) -> result`
 * `scheduler.status(taskGraphId='value') -> result`

#### Task Graph Information
 * `scheduler.info(taskGraphId) -> result`
 * `scheduler.info(taskGraphId='value') -> result`

#### Inspect Task Graph
 * `scheduler.inspect(taskGraphId) -> result`
 * `scheduler.inspect(taskGraphId='value') -> result`

#### Inspect Task from a Task-Graph
 * `scheduler.inspectTask(taskGraphId, taskId) -> result`
 * `scheduler.inspectTask(taskGraphId='value', taskId='value') -> result`

#### Ping Server
 * `scheduler.ping() -> None`




### Exchanges in `taskcluster.SchedulerEvents`
```python
// Create SchedulerEvents client instance
import taskcluster
schedulerEvents = taskcluster.SchedulerEvents(options)
```
#### Task-Graph Running Message
 * `schedulerEvents.taskGraphRunning(routingKeyPattern) -> routingKey`
   * routingKeyKind is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * taskId Description: Always takes the value `_`
   * runId Description: Always takes the value `_`
   * workerGroup Description: Always takes the value `_`
   * workerId Description: Always takes the value `_`
   * provisionerId Description: Always takes the value `_`
   * workerType Description: Always takes the value `_`
   * schedulerId is required  Description: Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production.
   * taskGraphId is required  Description: Identifier for the task-graph this message concerns
   * reserved Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task-Graph Extended Message
 * `schedulerEvents.taskGraphExtended(routingKeyPattern) -> routingKey`
   * routingKeyKind is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * taskId Description: Always takes the value `_`
   * runId Description: Always takes the value `_`
   * workerGroup Description: Always takes the value `_`
   * workerId Description: Always takes the value `_`
   * provisionerId Description: Always takes the value `_`
   * workerType Description: Always takes the value `_`
   * schedulerId is required  Description: Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production.
   * taskGraphId is required  Description: Identifier for the task-graph this message concerns
   * reserved Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task-Graph Blocked Message
 * `schedulerEvents.taskGraphBlocked(routingKeyPattern) -> routingKey`
   * routingKeyKind is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * taskId Description: Always takes the value `_`
   * runId Description: Always takes the value `_`
   * workerGroup Description: Always takes the value `_`
   * workerId Description: Always takes the value `_`
   * provisionerId Description: Always takes the value `_`
   * workerType Description: Always takes the value `_`
   * schedulerId is required  Description: Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production.
   * taskGraphId is required  Description: Identifier for the task-graph this message concerns
   * reserved Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task-Graph Finished Message
 * `schedulerEvents.taskGraphFinished(routingKeyPattern) -> routingKey`
   * routingKeyKind is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * taskId Description: Always takes the value `_`
   * runId Description: Always takes the value `_`
   * workerGroup Description: Always takes the value `_`
   * workerId Description: Always takes the value `_`
   * provisionerId Description: Always takes the value `_`
   * workerType Description: Always takes the value `_`
   * schedulerId is required  Description: Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production.
   * taskGraphId is required  Description: Identifier for the task-graph this message concerns
   * reserved Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.



<!-- END OF GENERATED DOCS -->
