---
title:        Payload Format
layout:       default
class:        html
docson:       true
marked:       true
ejs:          true
superagent:   true
docref:       true
order:        1
---

When submitting a task graph to the Task Cluster Queue (see
[createTask](/reference/platform/queue/reference/api-docs#createTask)) you must provide a
payload for defining the tasks to be executed by the worker. In the case of the
generic worker, the payload must conform to the following schema.

<div data-render-schema="http://schemas.taskcluster.net/generic-worker/v1/payload.json"></div>

The payload comprises of a command to run, environment variables to be set
(optionally encrypted) and a timeout for the task (`maxRunTime`).

The worker will run the task, upload log files, and report back status to the
Queue.

