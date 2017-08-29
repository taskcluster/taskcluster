# Scheduler AMQP Exchanges

##

The scheduler, typically available at `scheduler.taskcluster.net` is
responsible for accepting task-graphs and schedule tasks on the queue as
their dependencies are completed successfully.

This document describes the AMQP exchanges offered by the scheduler,
which allows third-party listeners to monitor task-graph submission and
resolution. These exchanges targets the following audience:
 * Reporters, who displays the state of task-graphs or emails people on
   failures, and
 * End-users, who wants notification of completed task-graphs

**Remark**, the task-graph scheduler will require that the `schedulerId`
for tasks is set to the `schedulerId` for the task-graph scheduler. In
production the `schedulerId` is typically `"task-graph-scheduler"`.
Furthermore, the task-graph scheduler will also require that
`taskGroupId` is equal to the `taskGraphId`.

Combined these requirements ensures that `schedulerId` and `taskGroupId`
have the same position in the routing keys for the queue exchanges.
See queue documentation for details on queue exchanges. Hence, making
it easy to listen for all tasks in a given task-graph.

Note that routing key entries 2 through 7 used for exchanges on the
task-graph scheduler is hardcoded to `_`. This is done to preserve
positional equivalence with exchanges offered by the queue.



## SchedulerEvents Client

```js
// Create SchedulerEvents client instance with default exchangePrefix:
// exchange/taskcluster-scheduler/v1/

const schedulerEvents = new taskcluster.SchedulerEvents(options);
```

## Exchanges in SchedulerEvents Client

```js
// schedulerEvents.taskGraphRunning :: routingKeyPattern -> Promise BindingInfo
schedulerEvents.taskGraphRunning(routingKeyPattern)
```

```js
// schedulerEvents.taskGraphExtended :: routingKeyPattern -> Promise BindingInfo
schedulerEvents.taskGraphExtended(routingKeyPattern)
```

```js
// schedulerEvents.taskGraphBlocked :: routingKeyPattern -> Promise BindingInfo
schedulerEvents.taskGraphBlocked(routingKeyPattern)
```

```js
// schedulerEvents.taskGraphFinished :: routingKeyPattern -> Promise BindingInfo
schedulerEvents.taskGraphFinished(routingKeyPattern)
```