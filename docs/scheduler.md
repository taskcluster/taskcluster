# Task-Graph Scheduler API Documentation

##

The task-graph scheduler, typically available at
`scheduler.taskcluster.net`, is responsible for accepting task-graphs and
scheduling tasks for evaluation by the queue as their dependencies are
satisfied.

This document describes API end-points offered by the task-graph
scheduler. These end-points targets the following audience:
 * Post-commit hooks, that wants to submit task-graphs for testing,
 * End-users, who wants to execute a set of dependent tasks, and
 * Tools, that wants to inspect the state of a task-graph.

## Scheduler Client

```js
// Create Scheduler client instance with default baseUrl:
// https://scheduler.taskcluster.net/v1

const scheduler = new taskcluster.Scheduler(options);
```

## Methods in Scheduler Client

```js
// scheduler.createTaskGraph :: (taskGraphId -> payload) -> Promise Result
scheduler.createTaskGraph(taskGraphId, payload)
```

```js
// scheduler.extendTaskGraph :: (taskGraphId -> payload) -> Promise Result
scheduler.extendTaskGraph(taskGraphId, payload)
```

```js
// scheduler.status :: taskGraphId -> Promise Result
scheduler.status(taskGraphId)
```

```js
// scheduler.info :: taskGraphId -> Promise Result
scheduler.info(taskGraphId)
```

```js
// scheduler.inspect :: taskGraphId -> Promise Result
scheduler.inspect(taskGraphId)
```

```js
// scheduler.inspectTask :: (taskGraphId -> taskId) -> Promise Result
scheduler.inspectTask(taskGraphId, taskId)
```

```js
// scheduler.ping :: () -> Promise Nothing
scheduler.ping()
```

