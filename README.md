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
 * `index.findTask(namespace) -> result`
 * `index.findTask(namespace='value') -> result`
 * `index.listNamespaces(namespace, payload) -> result`
 * `index.listNamespaces(payload, namespace='value') -> result`
 * `index.listTasks(namespace, payload) -> result`
 * `index.listTasks(payload, namespace='value') -> result`
 * `index.insertTask(namespace, payload) -> result`
 * `index.insertTask(payload, namespace='value') -> result`
 * `index.ping() -> None`


### Methods in `taskcluster.Auth`
```python
// Create Auth client instance
import taskcluster
auth = taskcluster.Auth(options)
```
 * `auth.scopes(clientId) -> result`
 * `auth.scopes(clientId='value') -> result`
 * `auth.getCredentials(clientId) -> result`
 * `auth.getCredentials(clientId='value') -> result`
 * `auth.client(clientId) -> result`
 * `auth.client(clientId='value') -> result`
 * `auth.createClient(clientId, payload) -> result`
 * `auth.createClient(payload, clientId='value') -> result`
 * `auth.modifyClient(clientId, payload) -> result`
 * `auth.modifyClient(payload, clientId='value') -> result`
 * `auth.removeClient(clientId) -> None`
 * `auth.removeClient(clientId='value') -> None`
 * `auth.resetCredentials(clientId) -> result`
 * `auth.resetCredentials(clientId='value') -> result`
 * `auth.listClients() -> result`
 * `auth.azureTableSAS(account, table) -> result`
 * `auth.azureTableSAS(account='value', table='value') -> result`
 * `auth.ping() -> None`


### Methods in `taskcluster.Queue`
```python
// Create Queue client instance
import taskcluster
queue = taskcluster.Queue(options)
```
 * `queue.createTask(taskId, payload) -> result`
 * `queue.createTask(payload, taskId='value') -> result`
 * `queue.getTask(taskId) -> result`
 * `queue.getTask(taskId='value') -> result`
 * `queue.defineTask(taskId, payload) -> result`
 * `queue.defineTask(payload, taskId='value') -> result`
 * `queue.scheduleTask(taskId) -> result`
 * `queue.scheduleTask(taskId='value') -> result`
 * `queue.status(taskId) -> result`
 * `queue.status(taskId='value') -> result`
 * `queue.pollTaskUrls(provisionerId, workerType) -> result`
 * `queue.pollTaskUrls(provisionerId='value', workerType='value') -> result`
 * `queue.claimTask(taskId, runId, payload) -> result`
 * `queue.claimTask(payload, taskId='value', runId='value') -> result`
 * `queue.reclaimTask(taskId, runId) -> result`
 * `queue.reclaimTask(taskId='value', runId='value') -> result`
 * `queue.claimWork(provisionerId, workerType, payload) -> result`
 * `queue.claimWork(payload, provisionerId='value', workerType='value') -> result`
 * `queue.reportCompleted(taskId, runId, payload) -> result`
 * `queue.reportCompleted(payload, taskId='value', runId='value') -> result`
 * `queue.reportFailed(taskId, runId) -> result`
 * `queue.reportFailed(taskId='value', runId='value') -> result`
 * `queue.reportException(taskId, runId, payload) -> result`
 * `queue.reportException(payload, taskId='value', runId='value') -> result`
 * `queue.rerunTask(taskId) -> result`
 * `queue.rerunTask(taskId='value') -> result`
 * `queue.createArtifact(taskId, runId, name, payload) -> result`
 * `queue.createArtifact(payload, taskId='value', runId='value', name='value') -> result`
 * `queue.getArtifact(taskId, runId, name) -> None`
 * `queue.getArtifact(taskId='value', runId='value', name='value') -> None`
 * `queue.getLatestArtifact(taskId, name) -> None`
 * `queue.getLatestArtifact(taskId='value', name='value') -> None`
 * `queue.listArtifacts(taskId, runId) -> result`
 * `queue.listArtifacts(taskId='value', runId='value') -> result`
 * `queue.listLatestArtifacts(taskId) -> result`
 * `queue.listLatestArtifacts(taskId='value') -> result`
 * `queue.getPendingTasks(provisionerId) -> None`
 * `queue.getPendingTasks(provisionerId='value') -> None`
 * `queue.pendingTaskCount(provisionerId) -> None`
 * `queue.pendingTaskCount(provisionerId='value') -> None`
 * `queue.pendingTasks(provisionerId, workerType) -> None`
 * `queue.pendingTasks(provisionerId='value', workerType='value') -> None`
 * `queue.ping() -> None`


### Methods in `taskcluster.QueueEvents`
```python
// Create QueueEvents client instance
import taskcluster
queueEvents = taskcluster.QueueEvents(options)
```


### Methods in `taskcluster.Scheduler`
```python
// Create Scheduler client instance
import taskcluster
scheduler = taskcluster.Scheduler(options)
```
 * `scheduler.createTaskGraph(taskGraphId, payload) -> result`
 * `scheduler.createTaskGraph(payload, taskGraphId='value') -> result`
 * `scheduler.extendTaskGraph(taskGraphId, payload) -> result`
 * `scheduler.extendTaskGraph(payload, taskGraphId='value') -> result`
 * `scheduler.status(taskGraphId) -> result`
 * `scheduler.status(taskGraphId='value') -> result`
 * `scheduler.info(taskGraphId) -> result`
 * `scheduler.info(taskGraphId='value') -> result`
 * `scheduler.inspect(taskGraphId) -> result`
 * `scheduler.inspect(taskGraphId='value') -> result`
 * `scheduler.inspectTask(taskGraphId, taskId) -> result`
 * `scheduler.inspectTask(taskGraphId='value', taskId='value') -> result`
 * `scheduler.ping() -> None`


### Methods in `taskcluster.SchedulerEvents`
```python
// Create SchedulerEvents client instance
import taskcluster
schedulerEvents = taskcluster.SchedulerEvents(options)
```


<!-- END OF GENERATED DOCS -->
