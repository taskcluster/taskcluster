var base      = require('taskcluster-base');

/** Declaration of exchanges offered by the queue */
var exchanges = new base.Exchanges({
  title:      "Queue AMQP Exchanges",
  description: [
    "The queue, typically available at `queue.taskcluster.net`, is responsible",
    "for accepting tasks and track their state as they are executed by",
    "workers. In order ensure they are eventually resolved.",
    "",
    "This document describes AMQP exchanges offered by the queue, which allows",
    "third-party listeners to monitor tasks as they progress to resolution.",
    "These exchanges targets the following audience:",
    " * Schedulers, who takes action after tasks are completed,",
    " * Workers, who wants to listen for new or canceled tasks (optional),",
    " * Tools, that wants to update their view as task progress.",
    "",
    "You'll notice that all the exchanges in the document shares the same",
    "routing key pattern. This makes it very easy to bind to all message about",
    "a certain kind tasks. You should also note that the `routing` property",
    "of a task will be used in the routing key. This property is user-defined",
    "and may contain dots (ie. multiple routing words).",
    "",
    "**Remark**, if the task-graph scheduler, documented elsewhere, is used to",
    "scheduler a task-graph, then task submitted will have their `routing` key",
    "prefixed by `task-graph-scheduler.<taskGraphId>.` this means that the",
    "first two words of the task `routing` key will be",
    "`'task-graph-scheduler'` and `taskGraphId`. This is useful if you're",
    "interested in updates about a specific task-graph, and it is necessary",
    "to know if you're binding to the `task.routing` key and submitting tasks",
    "through the task-graph scheduler. See documentation for task-graph",
    "scheduler for more details."
  ].join('\n')
});

// Export exchanges
module.exports = exchanges;

/** Common routing key construct for `exchanges.declare` */
var commonRoutingKey = [
  {
    name:             'taskId',
    summary:          "`taskId` for the task this message concerns",
    multipleWords:    false,
    required:         true,
    maxSize:          22
  }, {
    name:             'runId',
    summary:          "`runId` of latest run for the task, " +
                      "`_` if no run is exists for the task.",
    multipleWords:    false,
    required:         false,
    maxSize:          3
  }, {
    name:             'workerGroup',
    summary:          "`workerGroup` of latest run for the task, " +
                      "`_` if no run is exists for the task.",
    multipleWords:    false,
    required:         false,
    maxSize:          22
  }, {
    name:             'workerId',
    summary:          "`workerId` of latest run for the task, " +
                      "`_` if no run is exists for the task.",
    multipleWords:    false,
    required:         false,
    maxSize:          22
  }, {
    name:             'provisionerId',
    summary:          "`provisionerId` this task is targeted at.",
    multipleWords:    false,
    required:         true,
    maxSize:          22
  }, {
    name:             'workerType',
    summary:          "`workerType` this task must run on.",
    multipleWords:    false,
    required:         true,
    maxSize:          22
  }, {
    name:             'taskRouting',
    summary:          "task-specific routing key (`task.routing`).",
    multipleWords:    true,
    required:         true,
    maxSize:          128
  }
];

/** Build an AMQP compatible message from a message */
var commonMessageBuilder = function(message) {
  message.version = '0.2.0';
  return message;
};

/** Build a message from message */
var commonRoutingKeyBuilder = function(message) {
  return {
    taskId:           message.status.taskId,
    runId:            message.runId,
    workerGroup:      message.workerGroup,
    workerId:         message.workerId,
    provisionerId:    message.status.provisionerId,
    workerType:       message.status.workerType,
    routing:          message.status.routing
  };
};

/** Task pending exchange */
exchanges.declare({
  exchange:           'task-pending',
  name:               'taskPending',
  title:              "Task Pending Messages",
  description: [
    "When a task becomes `pending` a message is posted to this exchange.",
    "",
    "This is useful for workers who doesn't want to constantly poll the queue",
    "for new tasks. The queue will also be authority for task states and",
    "claims. But using this exchange workers should be able to distribute work",
    "efficiently and they would be able to reduce their polling interval",
    "significantly without affecting general responsiveness."
  ].join('\n'),
  routingKey:         commonRoutingKey,
  schema: 'http://schemas.taskcluster.net/queue/v1/task-pending-message.json#',
  messageBuilder:     commonMessageBuilder,
  routingKeyBuilder:  commonRoutingKeyBuilder
});


/** Task running exchange */
exchanges.declare({
  exchange:           'task-running',
  name:               'taskRunning',
  title:              "Task Running Messages",
  description: [
    "Whenever a task is claimed by a worker, a run is started on the worker,",
    "and a message is posted on this exchange.",
    "",
    "**Notice**, that the `logsUrl` may return `404` during the run, but by",
    "the end of the run the `logsUrl` will be valid. But this may not have",
    "happened when this message is posted.",
    "",
    "The idea is that workers can choose to upload the `logs.json` file as the",
    "first thing they do, in which case it'll often be available after a few",
    "minutes. This is useful if the worker supports live logging."
  ].join('\n'),
  routingKey:         commonRoutingKey,
  schema: 'http://schemas.taskcluster.net/queue/v1/task-running-message.json#',
  messageBuilder:     commonMessageBuilder,
  routingKeyBuilder:  commonRoutingKeyBuilder
});


/** Task completed exchange */
exchanges.declare({
  exchange:           'task-completed',
  name:               'taskCompleted',
  title:              "Task Completed Messages",
  description: [
    "When a task is completed by a worker a message is posted this exchange.",
    "This message is routed using the `run-id`, `worker-group` and `worker-id`",
    "that completed the task. But information about additional runs is also",
    "available from the task status structure.",
    "",
    "Upon task completion a result structure is made available, you'll find",
    "the url in the `resultURL` property. See _task storage_ documentation for",
    "details on the format of the file available through `resultUrl`."
  ].join('\n'),
  routingKey:         commonRoutingKey,
  schema: 'http://schemas.taskcluster.net/queue/v1/task-completed-message.json#',
  messageBuilder:     commonMessageBuilder,
  routingKeyBuilder:  commonRoutingKeyBuilder
});


/** Task failed exchange */
exchanges.declare({
  exchange:           'task-failed',
  name:               'taskFailed',
  title:              "Task Failed Messages",
  description: [
    "Whenever a task is concluded to be failed a message is posted to this",
    "exchange. This happens if the task isn't completed before its `deadlìne`,",
    "all retries failed (i.e. workers stopped responding) or the task was",
    "canceled by another entity.",
    "",
    "The specific _reason_ is evident from that task status structure, refer",
    "to the `reason` property."
  ].join('\n'),
  routingKey:         commonRoutingKey,
  schema: 'http://schemas.taskcluster.net/queue/v1/task-failed-message.json#',
  messageBuilder:     commonMessageBuilder,
  routingKeyBuilder:  commonRoutingKeyBuilder
});

