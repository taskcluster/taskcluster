module.exports = {
  "Auth": {
    "referenceUrl": "http://references.taskcluster.net/auth/v1/api.json",
    "reference": {
      "version": "0.2.0",
      "title": "Authentication API",
      "description": "Authentication related API end-points for taskcluster.",
      "baseUrl": "https://auth.taskcluster.net/v1",
      "entries": [
        {
          "type": "function",
          "method": "get",
          "route": "/client/<clientId>/scopes",
          "args": [
            "clientId"
          ],
          "name": "inspect",
          "title": "Get Client Authorized Scopes",
          "description": "Returns the scopes the client is authorized to access and the date-time\nwhere the clients authorization is set to expire.\n\nThis API end-point allows you inspect clients without getting access to\ncredentials, as provide by the `getCredentials` request below.",
          "scopes": [
            [
              "auth:inspect"
            ],
            [
              "auth:credentials"
            ]
          ],
          "output": "http://schemas.taskcluster.net/auth/v1/client-scopes-response.json#"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/client/<clientId>/credentials",
          "args": [
            "clientId"
          ],
          "name": "getCredentials",
          "title": "Get Client Credentials",
          "description": "Returns the clients `accessToken` as needed for verifying signatures.\nThis API end-point also returns the list of scopes the client is\nauthorized for and the date-time where the client authorization expires\n\nRemark, **if you don't need** the `accessToken` but only want to see what\nscopes a client is authorized for, you should use the `getScopes`\nfunction described above.",
          "scopes": [
            [
              "auth:credentials"
            ]
          ],
          "output": "http://schemas.taskcluster.net/auth/v1/client-credentials-response.json#"
        }
      ]
    }
  },
  "Queue": {
    "referenceUrl": "http://references.taskcluster.net/queue/v1/api.json",
    "reference": {
      "version": "0.2.0",
      "title": "Queue API Documentation",
      "description": "The queue, typically available at `queue.taskcluster.net`, is responsible\nfor accepting tasks and track their state as they are executed by\nworkers. In order ensure they are eventually resolved.\n\nThis document describes the API end-points offered by the queue. These \nend-points targets the following audience:\n * Schedulers, who create tasks to be executed,\n * Workers, who execute tasks, and\n * Tools, that wants to inspect the state of a task.",
      "baseUrl": "https://queue.taskcluster.net/v1",
      "entries": [
        {
          "type": "function",
          "method": "put",
          "route": "/task/<taskId>",
          "args": [
            "taskId"
          ],
          "name": "createTask",
          "title": "Create New Task",
          "description": "Create a new task, this is an **idempotent** operation, so repeat it if\nyou get an internal server error or network connection is dropped.\n\n**Task `deadline´**, the deadline property can be no more than 7 days\ninto the future. This is to limit the amount of pending tasks not being\ntaken care of. Ideally, you should use a much shorter deadline.\n\n**Task specific routing-keys**, using the `task.routes` property you may\ndefine task specific routing-keys. If a task has a task specific \nrouting-key: `<route>`, then the poster will be required to posses the\nscope `queue:route:<route>`. And when the an AMQP message about the task\nis published the message will be CC'ed with the routing-key: \n`route.<route>`. This is useful if you want another component to listen\nfor completed tasks you have posted.",
          "scopes": [
            [
              "queue:create-task:<provisionerId>/<workerType>"
            ]
          ],
          "input": "http://schemas.taskcluster.net/queue/v1/create-task-request.json#",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/task/<taskId>",
          "args": [
            "taskId"
          ],
          "name": "getTask",
          "title": "Fetch Task",
          "description": "Get task definition from queue.",
          "output": "http://schemas.taskcluster.net/queue/v1/task.json#"
        },
        {
          "type": "function",
          "method": "post",
          "route": "/task/<taskId>/define",
          "args": [
            "taskId"
          ],
          "name": "defineTask",
          "title": "Define Task",
          "description": "Define a task without scheduling it. This API end-point allows you to\nupload a task definition without having scheduled. The task won't be\nreported as pending until it is scheduled, see the scheduleTask API \nend-point.\n\nThe purpose of this API end-point is allow schedulers to upload task\ndefinitions without the tasks becoming _pending_ immediately. This useful\nif you have a set of dependent tasks. Then you can upload all the tasks\nand when the dependencies of a tasks have been resolved, you can schedule\nthe task by calling `/task/:taskId/schedule`. This eliminates the need to\nstore tasks somewhere else while waiting for dependencies to resolve.\n\n**Note** this operation is **idempotent**, as long as you upload the same\ntask definition as previously defined this operation is safe to retry.",
          "scopes": [
            [
              "queue:define-task:<provisionerId>/<workerType>"
            ],
            [
              "queue:create-task:<provisionerId>/<workerType>"
            ]
          ],
          "input": "http://schemas.taskcluster.net/queue/v1/create-task-request.json#",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#"
        },
        {
          "type": "function",
          "method": "post",
          "route": "/task/<taskId>/schedule",
          "args": [
            "taskId"
          ],
          "name": "scheduleTask",
          "title": "Schedule Defined Task",
          "description": "If you have define a task using `defineTask` API end-point, then you\ncan schedule the task to be scheduled using this method.\nThis will announce the task as pending and workers will be allowed, to\nclaim it and resolved the task.\n\n**Note** this operation is **idempotent** and will not fail or complain\nif called with `taskId` that is already scheduled, or even resolved.\nTo reschedule a task previously resolved, use `rerunTask`.",
          "scopes": [
            [
              "queue:schedule-task",
              "assume:scheduler-id:<schedulerId>/<taskGroupId>"
            ]
          ],
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/task/<taskId>/status",
          "args": [
            "taskId"
          ],
          "name": "status",
          "title": "Get task status",
          "description": "Get task status structure from `taskId`",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#"
        },
        {
          "type": "function",
          "method": "post",
          "route": "/task/<taskId>/runs/<runId>/claim",
          "args": [
            "taskId",
            "runId"
          ],
          "name": "claimTask",
          "title": "Claim task",
          "description": "claim a task, more to be added later...",
          "scopes": [
            [
              "queue:claim-task",
              "assume:worker-type:<provisionerId>/<workerType>",
              "assume:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "input": "http://schemas.taskcluster.net/queue/v1/task-claim-request.json#",
          "output": "http://schemas.taskcluster.net/queue/v1/task-claim-response.json#"
        },
        {
          "type": "function",
          "method": "post",
          "route": "/task/<taskId>/runs/<runId>/reclaim",
          "args": [
            "taskId",
            "runId"
          ],
          "name": "reclaimTask",
          "title": "Reclaim task",
          "description": "reclaim a task more to be added later...",
          "scopes": [
            [
              "queue:claim-task",
              "assume:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "output": "http://schemas.taskcluster.net/queue/v1/task-claim-response.json#"
        },
        {
          "type": "function",
          "method": "post",
          "route": "/claim-work/<provisionerId>/<workerType>",
          "args": [
            "provisionerId",
            "workerType"
          ],
          "name": "claimWork",
          "title": "Claim work for a worker",
          "description": "Claim work for a worker, returns information about an appropriate task\nclaimed for the worker. Similar to `claimTaskRun`, which can be\nused to claim a specific task, or reclaim a specific task extending the\n`takenUntil` timeout for the run.\n\n**Note**, that if no tasks are _pending_ this method will not assign a\ntask to you. Instead it will return `204` and you should wait a while\nbefore polling the queue again. To avoid polling declare a RabbitMQ queue\nfor your `workerType` claim work using `claimTaskRun`.",
          "scopes": [
            [
              "queue:claim-task",
              "assume:worker-type:<provisionerId>/<workerType>",
              "assume:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "input": "http://schemas.taskcluster.net/queue/v1/task-claim-request.json#",
          "output": "http://schemas.taskcluster.net/queue/v1/task-claim-response.json#"
        },
        {
          "type": "function",
          "method": "post",
          "route": "/task/<taskId>/runs/<runId>/completed",
          "args": [
            "taskId",
            "runId"
          ],
          "name": "reportCompleted",
          "title": "Report Run Completed",
          "description": "Report a run completed, resolving the run as `completed`.",
          "scopes": [
            [
              "queue:report-task-completed",
              "assume:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "input": "http://schemas.taskcluster.net/queue/v1/task-completed-request.json#",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#"
        },
        {
          "type": "function",
          "method": "post",
          "route": "/task/<taskId>/rerun",
          "args": [
            "taskId"
          ],
          "name": "rerunTask",
          "title": "Rerun a Resolved Task",
          "description": "This method _reruns_ a previously resolved task, even if it was\n_completed_. This is useful if your task completes unsuccessfully, and\nyou just want to run it from scratch again. This will also reset the\nnumber of `retries` allowed.\n\nRemember that `retries` in the task status counts the number of runs that\nthe queue have started because the worker stopped responding, for example\nbecause a spot node died.\n\n**Remark** this operation is idempotent, if you try to rerun a task that\nisn't either `failed` or `completed`, this operation will just return the\ncurrent task status.",
          "scopes": [
            [
              "queue:rerun-task",
              "assume:scheduler-id:<schedulerId>/<taskGroupId>"
            ]
          ],
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#"
        },
        {
          "type": "function",
          "method": "post",
          "route": "/task/<taskId>/runs/<runId>/artifacts/<name>",
          "args": [
            "taskId",
            "runId",
            "name"
          ],
          "name": "createArtifact",
          "title": "Create Artifact",
          "description": "This API end-point creates an artifact for a specific run of a task. This\nshould **only** be used by a worker currently operating on this task, or\nfrom a process running within the task (ie. on the worker).\n\nAll artifacts must specify when they `expires`, the queue will\nautomatically take care of deleting artifacts past their\nexpiration point. This features makes it feasible to upload large\nintermediate artifacts from data processing applications, as the\nartifacts can be set to expire a few days later.\n\nWe currently support 4 different `storageType`s, each storage type have\nslightly different features and in some cases difference semantics.\n\n**S3 artifacts**, is useful for static files which will be stored on S3.\nWhen creating an S3 artifact is create the queue will return a pre-signed\nURL to which you can do a `PUT` request to upload your artifact. Note\nthat `PUT` request **must** specify the `content-length` header and\n**must** give the `content-type` header the same value as in the request\nto `createArtifact`.\n\n**Azure artifacts**, are stored in _Azure Blob Storage_ service, which\ngiven the consistency guarantees and API interface offered by Azure is\nmore suitable for artifacts that will be modified during the execution\nof the task. For example docker-worker has a feature that persists the\ntask log to Azure Blob Storage every few seconds creating a somewhat\nlive log. A request to create an Azure artifact will return a URL\nfeaturing a [Shared-Access-Signature](http://msdn.microsoft.com/en-us/library/azure/dn140256.aspx),\nrefer to MSDN for further information on how to use these.\n\n**Reference artifacts**, only consists of meta-data which the queue will\nstore for you. These artifacts really only have a `url` property and\nwhen the artifact is requested the client will be redirect the URL\nprovided with a `303` (See Other) redirect. Please note that we cannot\ndelete artifacts you upload to other service, we can only delete the\nreference to the artifact, when it expires.\n\n**Error artifacts**, only consists of meta-data which the queue will\nstore for you. These artifacts are only meant to indicate that you the\nworker or the task failed to generate a specific artifact, that you\nwould otherwise have uploaded. For example docker-worker will upload an\nerror artifact, if the file it was supposed to upload doesn't exists or\nturns out to be a directory. Clients requesting an error artifact will\nget a `403` (Forbidden) response. This is mainly designed to ensure that\ndependent tasks can distinguish between artifacts that were suppose to\nbe generated and artifacts for which the name is misspelled.\n\n**Artifact immutability**, generally speaking you cannot overwrite an\nartifact when created. But if you repeat the request with the same\nproperties the request will succeed as the operation is idempotent.\nThis is useful if you need to refresh a signed URL while uploading.\nDo not abuse this to overwrite artifacts created by another entity!\nSuch as worker-host overwriting artifact created by worker-code.\n\nAs a special case the `url` property on _reference artifacts_ can be\nupdated. You should only use this to update the `url` property for\nreference artifacts your process has created.",
          "scopes": [
            [
              "queue:create-artifact:<name>",
              "assume:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "input": "http://schemas.taskcluster.net/queue/v1/post-artifact-request.json",
          "output": "http://schemas.taskcluster.net/queue/v1/post-artifact-response.json"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/task/<taskId>/runs/<runId>/artifacts/<name>",
          "args": [
            "taskId",
            "runId",
            "name"
          ],
          "name": "getArtifact",
          "title": "Get Artifact from Run",
          "description": "Get artifact by `<name>` from a specific run.\n\n**Public Artifacts**, in-order to get an artifact you need the scope\n`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.\nBut if the artifact `name` starts with `public/`, authentication and\nauthorization is not necessary to fetch the artifact.\n\n**API Clients**, this method will redirect you to the artifact, if it is\nstored externally. Either way, the response may not be JSON. So API\nclient users might want to generate a signed URL for this end-point and\nuse that URL with a normal HTTP client.",
          "scopes": [
            [
              "queue:get-artifact:<name>"
            ]
          ]
        },
        {
          "type": "function",
          "method": "get",
          "route": "/task/<taskId>/artifacts/<name>",
          "args": [
            "taskId",
            "name"
          ],
          "name": "getLatestArtifact",
          "title": "Get Artifact from Latest Run",
          "description": "Get artifact by `<name>` from the last run of a task.\n\n**Public Artifacts**, in-order to get an artifact you need the scope\n`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.\nBut if the artifact `name` starts with `public/`, authentication and\nauthorization is not necessary to fetch the artifact.\n\n**API Clients**, this method will redirect you to the artifact, if it is\nstored externally. Either way, the response may not be JSON. So API\nclient users might want to generate a signed URL for this end-point and\nuse that URL with a normal HTTP client.\n\n**Remark**, this end-point is slightly slower than\n`queue.getArtifact`, so consider that if you already know the `runId` of\nthe latest run. Otherwise, just us the most convenient API end-point.",
          "scopes": [
            [
              "queue:get-artifact:<name>"
            ]
          ]
        },
        {
          "type": "function",
          "method": "get",
          "route": "/task/<taskId>/runs/<runId>/artifacts",
          "args": [
            "taskId",
            "runId"
          ],
          "name": "listArtifacts",
          "title": "Get Artifacts from Run",
          "description": "Returns a list of artifacts and associated meta-data for a given run.",
          "output": "http://schemas.taskcluster.net/queue/v1/list-artifacts-response.json"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/task/<taskId>/artifacts",
          "args": [
            "taskId"
          ],
          "name": "listLatestArtifacts",
          "title": "Get Artifacts from Latest Run",
          "description": "Returns a list of artifacts and associated meta-data for the latest run\nfrom the given task.",
          "output": "http://schemas.taskcluster.net/queue/v1/list-artifacts-response.json"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/pending-tasks/<provisionerId>",
          "args": [
            "provisionerId"
          ],
          "name": "getPendingTasks",
          "title": "Fetch pending tasks for provisioner",
          "description": "Documented later...\n\n**Warning** this api end-point is **not stable**."
        },
        {
          "type": "function",
          "method": "get",
          "route": "/settings/amqp-connection-string",
          "args": [],
          "name": "getAMQPConnectionString",
          "title": "Fetch AMQP Connection String",
          "description": "Most hosted AMQP services requires us to specify a virtual host, \nso hardcoding the AMQP connection string into various services would be \na bad solution. Hence, we offer all authorized queue consumers to fetch \nan AMQP connection string using the API end-point.\n\n**Warning**, this API end-point is not stable, and may change in the \nfuture the strategy of not hardcoding AMQP connection details into \nvarious components obviously makes sense. But as we have no method of \nnotifying consumers that the connection string have moved. This \napproach may not be optimal either. Thus, we may be choose to remove \nthis API end-point when `pulse.mozilla.org` is a stable AMQP service \nwe can rely on.",
          "output": "http://schemas.taskcluster.net/queue/v1/amqp-connection-string-response.json#"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/ping",
          "args": [],
          "name": "ping",
          "title": "Ping Server",
          "description": "Documented later...\n\n**Warning** this api end-point is **not stable**."
        }
      ]
    }
  },
  "QueueEvents": {
    "referenceUrl": "http://references.taskcluster.net/queue/v1/exchanges.json",
    "reference": {
      "version": "0.2.0",
      "title": "Queue AMQP Exchanges",
      "description": "The queue, typically available at `queue.taskcluster.net`, is responsible\nfor accepting tasks and track their state as they are executed by\nworkers. In order ensure they are eventually resolved.\n\nThis document describes AMQP exchanges offered by the queue, which allows\nthird-party listeners to monitor tasks as they progress to resolution.\nThese exchanges targets the following audience:\n * Schedulers, who takes action after tasks are completed,\n * Workers, who wants to listen for new or canceled tasks (optional),\n * Tools, that wants to update their view as task progress.\n\nYou'll notice that all the exchanges in the document shares the same\nrouting key pattern. This makes it very easy to bind to all messages\nabout a certain kind tasks.\n\n**Task-graphs**, if the task-graph scheduler, documented elsewhere, is\nused to schedule a task-graph, the task submitted will have their\n`schedulerId` set to `'task-graph-scheduler'`, and their `taskGroupId` to\nthe `taskGraphId` as given to the task-graph scheduler. This is useful if\nyou wish to listen for all messages in a specific task-graph.\n\n**Task specific routes**, a task can define a task specific route using\nthe `task.routes` property. See task creation documentation for details\non permissions required to provide task specific routes. If a task has\nthe entry `'notify.by-email'` in as task specific route defined in\n`task.routes` all messages about this task will be CC'ed with the\nrouting-key `'route.notify.by-email'`.\n\nThese routes will always be prefixed `route.`, so that cannot interfere\nwith the _primary_ routing key as documented here. Notice that the\n_primary_ routing key is alwasys prefixed `primary.`. This is ensured\nin the routing key reference, so API clients will do this automatically.\n\nPlease, note that the way RabbitMQ works, the message will only arrive\nin your queue once, even though you may have bound to the exchange with\nmultiple routing key patterns that matches more of the CC'ed routing\nrouting keys.\n\n**Delivery guarantees**, most operations on the queue are idempotent,\nwhich means that if repeated with the same arguments then the requests\nwill ensure completion of the operation and return the same response.\nThis is useful if the server crashes or the TCP connection breaks, but\nwhen re-executing an idempotent operation, the queue will also resend\nany related AMQP messages. Hence, messages may be repeated.\n\nThis shouldn't be much of a problem, as the best you can achieve using\nconfirm messages with AMQP is at-least-once delivery semantics. Hence,\nthis only prevents you from obtaining at-most-once delivery semantics.\n\n**Remark**, some message generated by timeouts maybe dropped if the\nserver crashes at wrong time. Ideally, we'll address this in the\nfuture. For now we suggest you ignore this corner case, and notify us\nif this corner case is of concern to you.",
      "exchangePrefix": "queue/v1/",
      "entries": [
        {
          "type": "topic-exchange",
          "exchange": "task-defined",
          "name": "taskDefined",
          "title": "Task Defined Messages",
          "description": "When a task is created or just defined a message is posted to this\nexchange.\n\nThis message exchange is mainly useful when tasks are scheduled by a\nscheduler that uses `defineTask` as this does not make the task\n`pending`. Thus, no `taskPending` message is published.\nPlease, note that messages are also published on this exchange if defined\nusing `createTask`.",
          "routingKey": [
            {
              "name": "routingKeyKind",
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.",
              "constant": "primary",
              "required": true,
              "multipleWords": false,
              "maxSize": 7
            },
            {
              "name": "taskId",
              "summary": "`taskId` for the task this message concerns",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "runId",
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task.",
              "required": false,
              "maxSize": 3,
              "multipleWords": false
            },
            {
              "name": "workerGroup",
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task.",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerId",
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task.",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "provisionerId",
              "summary": "`provisionerId` this task is targeted at.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerType",
              "summary": "`workerType` this task must run on.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "schedulerId",
              "summary": "`schedulerId` this task was created by.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "taskGroupId",
              "summary": "`taskGroupId` this task was created in.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "reserved",
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.",
              "multipleWords": true,
              "maxSize": 1,
              "required": false
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/task-defined-message.json#"
        },
        {
          "type": "topic-exchange",
          "exchange": "task-pending",
          "name": "taskPending",
          "title": "Task Pending Messages",
          "description": "When a task becomes `pending` a message is posted to this exchange.\n\nThis is useful for workers who doesn't want to constantly poll the queue\nfor new tasks. The queue will also be authority for task states and\nclaims. But using this exchange workers should be able to distribute work\nefficiently and they would be able to reduce their polling interval\nsignificantly without affecting general responsiveness.",
          "routingKey": [
            {
              "name": "routingKeyKind",
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.",
              "constant": "primary",
              "required": true,
              "multipleWords": false,
              "maxSize": 7
            },
            {
              "name": "taskId",
              "summary": "`taskId` for the task this message concerns",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "runId",
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task.",
              "required": true,
              "maxSize": 3,
              "multipleWords": false
            },
            {
              "name": "workerGroup",
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task.",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerId",
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task.",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "provisionerId",
              "summary": "`provisionerId` this task is targeted at.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerType",
              "summary": "`workerType` this task must run on.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "schedulerId",
              "summary": "`schedulerId` this task was created by.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "taskGroupId",
              "summary": "`taskGroupId` this task was created in.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "reserved",
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.",
              "multipleWords": true,
              "maxSize": 1,
              "required": false
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/task-pending-message.json#"
        },
        {
          "type": "topic-exchange",
          "exchange": "task-running",
          "name": "taskRunning",
          "title": "Task Running Messages",
          "description": "Whenever a task is claimed by a worker, a run is started on the worker,\nand a message is posted on this exchange.",
          "routingKey": [
            {
              "name": "routingKeyKind",
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.",
              "constant": "primary",
              "required": true,
              "multipleWords": false,
              "maxSize": 7
            },
            {
              "name": "taskId",
              "summary": "`taskId` for the task this message concerns",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "runId",
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task.",
              "required": true,
              "maxSize": 3,
              "multipleWords": false
            },
            {
              "name": "workerGroup",
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerId",
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "provisionerId",
              "summary": "`provisionerId` this task is targeted at.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerType",
              "summary": "`workerType` this task must run on.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "schedulerId",
              "summary": "`schedulerId` this task was created by.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "taskGroupId",
              "summary": "`taskGroupId` this task was created in.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "reserved",
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.",
              "multipleWords": true,
              "maxSize": 1,
              "required": false
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/task-running-message.json#"
        },
        {
          "type": "topic-exchange",
          "exchange": "artifact-created",
          "name": "artifactCreated",
          "title": "Artifact Creation Messages",
          "description": "Whenever the `createArtifact` end-point is called, the queue will create\na record of the artifact and post a message on this exchange. All of this\nhappens before the queue returns a signed URL for the caller to upload\nthe actual artifact with (pending on `storageType`).\n\nThis means that the actual artifact is rarely available when this message\nis posted. But it is not unreasonable to assume that the artifact will\nwill become available at some point later. Most signatures will expire in\n30 minutes or so, forcing the uploader to call `createArtifact` with\nthe same payload again in-order to continue uploading the artifact.\n\nHowever, in most cases (especially for small artifacts) it's very\nreasonable assume the artifact will be available within a few minutes.\nThis property means that this exchange is mostly useful for tools\nmonitoring task evaluation. One could also use it count number of\nartifacts per task, or _index_ artifacts though in most cases it'll be\nsmarter to index artifacts after the task in question have completed\nsuccessfully.",
          "routingKey": [
            {
              "name": "routingKeyKind",
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.",
              "constant": "primary",
              "required": true,
              "multipleWords": false,
              "maxSize": 7
            },
            {
              "name": "taskId",
              "summary": "`taskId` for the task this message concerns",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "runId",
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task.",
              "required": true,
              "maxSize": 3,
              "multipleWords": false
            },
            {
              "name": "workerGroup",
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerId",
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "provisionerId",
              "summary": "`provisionerId` this task is targeted at.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerType",
              "summary": "`workerType` this task must run on.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "schedulerId",
              "summary": "`schedulerId` this task was created by.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "taskGroupId",
              "summary": "`taskGroupId` this task was created in.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "reserved",
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.",
              "multipleWords": true,
              "maxSize": 1,
              "required": false
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/artifact-created-message.json#"
        },
        {
          "type": "topic-exchange",
          "exchange": "task-completed",
          "name": "taskCompleted",
          "title": "Task Completed Messages",
          "description": "When a task is completed by a worker a message is posted this exchange.\nThis message is routed using the `runId`, `workerGroup` and `workerId`\nthat completed the task. But information about additional runs is also\navailable from the task status structure.",
          "routingKey": [
            {
              "name": "routingKeyKind",
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.",
              "constant": "primary",
              "required": true,
              "multipleWords": false,
              "maxSize": 7
            },
            {
              "name": "taskId",
              "summary": "`taskId` for the task this message concerns",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "runId",
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task.",
              "required": true,
              "maxSize": 3,
              "multipleWords": false
            },
            {
              "name": "workerGroup",
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerId",
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "provisionerId",
              "summary": "`provisionerId` this task is targeted at.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerType",
              "summary": "`workerType` this task must run on.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "schedulerId",
              "summary": "`schedulerId` this task was created by.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "taskGroupId",
              "summary": "`taskGroupId` this task was created in.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "reserved",
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.",
              "multipleWords": true,
              "maxSize": 1,
              "required": false
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/task-completed-message.json#"
        },
        {
          "type": "topic-exchange",
          "exchange": "task-failed",
          "name": "taskFailed",
          "title": "Task Failed Messages",
          "description": "Whenever a task is concluded to be failed a message is posted to this\nexchange. This happens if the task isn't completed before its `deadlìne`,\nall retries failed (i.e. workers stopped responding) or the task was\ncanceled by another entity.\n\nThe specific _reason_ is evident from that task status structure, refer\nto the `reasonResolved` property for the last run.",
          "routingKey": [
            {
              "name": "routingKeyKind",
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.",
              "constant": "primary",
              "required": true,
              "multipleWords": false,
              "maxSize": 7
            },
            {
              "name": "taskId",
              "summary": "`taskId` for the task this message concerns",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "runId",
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task.",
              "required": false,
              "maxSize": 3,
              "multipleWords": false
            },
            {
              "name": "workerGroup",
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task.",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerId",
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task.",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "provisionerId",
              "summary": "`provisionerId` this task is targeted at.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerType",
              "summary": "`workerType` this task must run on.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "schedulerId",
              "summary": "`schedulerId` this task was created by.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "taskGroupId",
              "summary": "`taskGroupId` this task was created in.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "reserved",
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.",
              "multipleWords": true,
              "maxSize": 1,
              "required": false
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/task-failed-message.json#"
        }
      ]
    }
  },
  "Scheduler": {
    "referenceUrl": "http://references.taskcluster.net/scheduler/v1/api.json",
    "reference": {
      "version": "0.2.0",
      "title": "Task-Graph Scheduler API Documentation",
      "description": "The task-graph scheduler, typically available at\n`scheduler.taskcluster.net`, is responsible for accepting task-graphs and\nscheduling tasks for evaluation by the queue as their dependencies are\nsatisfied.\n\nThis document describes API end-points offered by the task-graph\nscheduler. These end-points targets the following audience:\n * Post-commit hooks, that wants to submit task-graphs for testing,\n * End-users, who wants to execute a set of dependent tasks, and\n * Tools, that wants to inspect the state of a task-graph.",
      "baseUrl": "https://scheduler.taskcluster.net/v1",
      "entries": [
        {
          "type": "function",
          "method": "put",
          "route": "/task-graph/<taskGraphId>",
          "args": [
            "taskGraphId"
          ],
          "name": "createTaskGraph",
          "title": "Create new task-graph",
          "description": "Create a new task-graph, the `status` of the resulting JSON is a\ntask-graph status structure, you can find the `taskGraphId` in this\nstructure.\n\n**Referencing required tasks**, it is possible to reference other tasks\nin the task-graph that must be completed successfully before a task is\nscheduled. You just specify the `taskId` in the list of `required` tasks.\nSee the example below, where the second task requires the first task.\n```js\n{\n  ...\n  tasks: [\n    {\n      taskId:     \"XgvL0qtSR92cIWpcwdGKCA\",\n      requires:   [],\n      ...\n    },\n    {\n      taskId:     \"73GsfK62QNKAk2Hg1EEZTQ\",\n      requires:   [\"XgvL0qtSR92cIWpcwdGKCA\"],\n      task: {\n        payload: {\n          env: {\n            DEPENDS_ON:  \"XgvL0qtSR92cIWpcwdGKCA\"\n          }\n          ...\n        }\n        ...\n      },\n      ...\n    }\n  ]\n}\n```\n\n**The `schedulerId` property**, defaults to the `schedulerId` of this\nscheduler in production that is `\"task-graph-scheduler\"`. This\nproperty must be either undefined or set to `\"task-graph-scheduler\"`,\notherwise the task-graph will be rejected.\n\n**The `taskGroupId` property**, defaults to the `taskGraphId` of the\ntask-graph submitted, and if provided much be the `taskGraphId` of\nthe task-graph. Otherwise the task-graph will be rejected.\n\n**Task-graph scopes**, a task-graph is assigned a set of scopes, just\nlike tasks. Tasks within a task-graph cannot have scopes beyond those\nthe task-graph has. The task-graph scheduler will execute all requests\non behalf of a task-graph using the set of scopes assigned to the\ntask-graph. Thus, if you are submitting tasks to `my-worker-type` under\n`my-provisioner` it's important that your task-graph has the scope\nrequired to define tasks for this `provisionerId` and `workerType`.\nSee the queue for details on permissions required. Note, the task-graph\ndoes not require permissions to schedule the tasks. This is done with\nscopes provided by the task-graph scheduler.\n\n**Task-graph specific routing-keys**, using the `taskGraph.routes`\nproperty you may define task-graph specific routing-keys. If a task-graph\nhas a task-graph specific routing-key: `<route>`, then the poster will\nbe required to posses the scope `scheduler:route:<route>`. And when the\nan AMQP message about the task-graph is published the message will be\nCC'ed with the routing-key: `route.<route>`. This is useful if you want\nanother component to listen for completed tasks you have posted.",
          "scopes": [
            [
              "scheduler:create-task-graph"
            ]
          ],
          "input": "http://schemas.taskcluster.net/scheduler/v1/task-graph.json#",
          "output": "http://schemas.taskcluster.net/scheduler/v1/task-graph-status-response.json#"
        },
        {
          "type": "function",
          "method": "post",
          "route": "/task-graph/<taskGraphId>/extend",
          "args": [
            "taskGraphId"
          ],
          "name": "extendTaskGraph",
          "title": "Extend existing task-graph",
          "description": "Add a set of tasks to an existing task-graph. The request format is very\nsimilar to the request format for creating task-graphs. But `routes`\nkey, `scopes`, `metadata` and `tags` cannot be modified.\n\n**Referencing required tasks**, just as when task-graphs are created,\neach task has a list of required tasks. It is possible to reference\nall `taskId`s within the task-graph.\n\n**Safety,** it is only _safe_ to call this API end-point while the\ntask-graph being modified is still running. If the task-graph is\n_finished_ or _blocked_, this method will leave the task-graph in this\nstate. Hence, it is only truly _safe_ to call this API end-point from\nwithin a task in the task-graph being modified.",
          "scopes": [
            [
              "scheduler:extend-task-graph:<taskGraphId>"
            ]
          ],
          "input": "http://schemas.taskcluster.net/scheduler/v1/extend-task-graph-request.json#",
          "output": "http://schemas.taskcluster.net/scheduler/v1/task-graph-status-response.json#"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/task-graph/<taskGraphId>/status",
          "args": [
            "taskGraphId"
          ],
          "name": "status",
          "title": "Task Graph Status",
          "description": "Get task-graph status, this will return the _task-graph status\nstructure_. which can be used to check if a task-graph is `running`,\n`blocked` or `finished`.\n\n**Note**, that `finished` implies successfully completion.",
          "output": "http://schemas.taskcluster.net/scheduler/v1/task-graph-status-response.json"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/task-graph/<taskGraphId>/info",
          "args": [
            "taskGraphId"
          ],
          "name": "info",
          "title": "Task Graph Information",
          "description": "Get task-graph information, this includes the _task-graph status\nstructure_, along with `metadata` and `tags`, but not information\nabout all tasks.\n\nIf you want more detailed information use the `inspectTaskGraph`\nend-point instead.",
          "output": "http://schemas.taskcluster.net/scheduler/v1/task-graph-info-response.json"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/task-graph/<taskGraphId>/inspect",
          "args": [
            "taskGraphId"
          ],
          "name": "inspect",
          "title": "Inspect Task Graph",
          "description": "Inspect a task-graph, this returns all the information the task-graph\nscheduler knows about the task-graph and the state of its tasks.\n\n**Warning**, some of these fields are borderline internal to the\ntask-graph scheduler and we may choose to change or make them internal\nlater. Also note that note all of the information is formalized yet.\nThe JSON schema will be updated to reflect formalized values, we think\nit's safe to consider the values stable.\n\nTake these considerations into account when using the API end-point,\nas we do not promise it will remain fully backward compatible in\nthe future.",
          "output": "http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/ping",
          "args": [],
          "name": "ping",
          "title": "Ping Server",
          "description": "Documented later...\n\n**Warning** this api end-point is **not stable**."
        }
      ]
    }
  },
  "SchedulerEvents": {
    "referenceUrl": "http://references.taskcluster.net/scheduler/v1/exchanges.json",
    "reference": {
      "version": "0.2.0",
      "title": "Scheduler AMQP Exchanges",
      "description": "The scheduler, typically available at `scheduler.taskcluster.net` is\nresponsible for accepting task-graphs and schedule tasks on the queue as\ntheir dependencies are completed successfully.\n\nThis document describes the AMQP exchanges offered by the scheduler,\nwhich allows third-party listeners to monitor task-graph submission and\nresolution. These exchanges targets the following audience:\n * Reporters, who displays the state of task-graphs or emails people on\n   failures, and\n * End-users, who wants notification of completed task-graphs\n\n**Remark**, the task-graph scheduler will require that the `schedulerId`\nfor tasks is set to the `schedulerId` for the task-graph scheduler. In\nproduction the `schedulerId` is typically `\"task-graph-scheduler\"`.\nFurthermore, the task-graph scheduler will also require that\n`taskGroupId` is equal to the `taskGraphId`.\n\nCombined these requirements ensures that `schedulerId` and `taskGroupId`\nhave the same position in the routing keys for the queue exchanges.\nSee queue documentation for details on queue exchanges. Hence, making\nit easy to listen for all tasks in a given task-graph.\n\nNote that routing key entries 2 through 7 used for exchanges on the\ntask-graph scheduler is hardcoded to `_`. This is done to preserve\npositional equivalence with exchanges offered by the queue.",
      "exchangePrefix": "scheduler/v1/",
      "entries": [
        {
          "type": "topic-exchange",
          "exchange": "task-graph-running",
          "name": "taskGraphRunning",
          "title": "Task-Graph Running Message",
          "description": "When a task-graph is submitted it immediately starts running and a\nmessage is posted on this exchange to indicate that a task-graph have\nbeen submitted.",
          "routingKey": [
            {
              "name": "routingKeyKind",
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.",
              "constant": "primary",
              "required": true,
              "multipleWords": false,
              "maxSize": 7
            },
            {
              "name": "taskId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "runId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 3,
              "multipleWords": false
            },
            {
              "name": "workerGroup",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "provisionerId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerType",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "schedulerId",
              "summary": "Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "taskGraphId",
              "summary": "Identifier for the task-graph this message concerns",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "reserved",
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.",
              "multipleWords": true,
              "maxSize": 1,
              "required": false
            }
          ],
          "schema": "http://schemas.taskcluster.net/scheduler/v1/task-graph-running-message.json#"
        },
        {
          "type": "topic-exchange",
          "exchange": "task-graph-extended",
          "name": "taskGraphExtended",
          "title": "Task-Graph Extended Message",
          "description": "When a task-graph is submitted it immediately starts running and a\nmessage is posted on this exchange to indicate that a task-graph have\nbeen submitted.",
          "routingKey": [
            {
              "name": "routingKeyKind",
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.",
              "constant": "primary",
              "required": true,
              "multipleWords": false,
              "maxSize": 7
            },
            {
              "name": "taskId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "runId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 3,
              "multipleWords": false
            },
            {
              "name": "workerGroup",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "provisionerId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerType",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "schedulerId",
              "summary": "Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "taskGraphId",
              "summary": "Identifier for the task-graph this message concerns",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "reserved",
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.",
              "multipleWords": true,
              "maxSize": 1,
              "required": false
            }
          ],
          "schema": "http://schemas.taskcluster.net/scheduler/v1/task-graph-extended-message.json#"
        },
        {
          "type": "topic-exchange",
          "exchange": "task-graph-blocked",
          "name": "taskGraphBlocked",
          "title": "Task-Graph Blocked Message",
          "description": "When a task is completed unsuccessfully and all reruns have been\nattempted, the task-graph will not complete successfully and it's\ndeclared to be _blocked_, by some task that consistently completes\nunsuccessfully.\n\nWhen a task-graph becomes blocked a messages is posted to this exchange.\nThe message features the `taskId` of the task that caused the task-graph\nto become blocked.",
          "routingKey": [
            {
              "name": "routingKeyKind",
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.",
              "constant": "primary",
              "required": true,
              "multipleWords": false,
              "maxSize": 7
            },
            {
              "name": "taskId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "runId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 3,
              "multipleWords": false
            },
            {
              "name": "workerGroup",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "provisionerId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerType",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "schedulerId",
              "summary": "Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "taskGraphId",
              "summary": "Identifier for the task-graph this message concerns",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "reserved",
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.",
              "multipleWords": true,
              "maxSize": 1,
              "required": false
            }
          ],
          "schema": "http://schemas.taskcluster.net/scheduler/v1/task-graph-blocked-message.json#"
        },
        {
          "type": "topic-exchange",
          "exchange": "task-graph-finished",
          "name": "taskGraphFinished",
          "title": "Task-Graph Finished Message",
          "description": "When all tasks of a task-graph have completed successfully, the\ntask-graph is declared to be finished, and a message is posted to this\nexchange.",
          "routingKey": [
            {
              "name": "routingKeyKind",
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.",
              "constant": "primary",
              "required": true,
              "multipleWords": false,
              "maxSize": 7
            },
            {
              "name": "taskId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "runId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 3,
              "multipleWords": false
            },
            {
              "name": "workerGroup",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "provisionerId",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "workerType",
              "summary": "Always takes the value `_`",
              "required": false,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "schedulerId",
              "summary": "Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production.",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "taskGraphId",
              "summary": "Identifier for the task-graph this message concerns",
              "required": true,
              "maxSize": 22,
              "multipleWords": false
            },
            {
              "name": "reserved",
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.",
              "multipleWords": true,
              "maxSize": 1,
              "required": false
            }
          ],
          "schema": "http://schemas.taskcluster.net/scheduler/v1/task-graph-finished-message.json#"
        }
      ]
    }
  },
  "index": {
    "referenceUrl": "http://references.taskcluster.net/index/v1/api.json",
    "reference": {
      "version": "0.2.0",
      "title": "Task Index API Documentation",
      "description": "The task index, typically available at `index.taskcluster.net`, is\nresponsible for indexing tasks. In order to ensure that tasks can be\nlocated by recency and/or arbitrary strings. Common use-cases includes\n\n * Locate tasks by git or mercurial `<revision>`, or\n * Locate latest task from given `<branch>`, such as a release.\n\n**Index hierarchy**, tasks are indexed in a dot `.` separated hierarchy\ncalled a namespace. For example a task could be indexed in\n`<revision>.linux-64.release-build`. In this case the following\nnamespaces is created.\n\n 1. `<revision>`, and,\n 2. `<revision>.linux-64`\n\nThe inside the namespace `<revision>` you can find the namespace\n`<revision>.linux-64` inside which you can find the indexed task\n`<revision>.linux-64.release-build`. In this example you'll be able to\nfind build for a given revision.\n\n**Task Rank**, when a task is indexed, it is assigned a `rank` (defaults\nto `0`). If another task is already indexed in the same namespace with\nthe same lower or equal `rank`, the task will be overwritten. For example\nconsider a task indexed as `mozilla-central.linux-64.release-build`, in\nthis case on might choose to use a unix timestamp or mercurial revision\nnumber as `rank`. This way the latest completed linux 64 bit release\nbuild is always available at `mozilla-central.linux-64.release-build`.\n\n**Indexed Data**, when a task is located in the index you will get the\n`taskId` and an additional user-defined JSON blob that was indexed with\ntask. You can use this to store additional information you would like to\nget additional from the index.\n\n**Entry Expiration**, all indexed entries must have an expiration date.\nTypically this defaults to one year, if not specified. If you are\nindexing tasks to make it easy to find artifacts, consider using the\nexpiration date that the artifacts is assigned.\n\n**Indexing Routes**, tasks can be indexed using the API below, but the\nmost common way to index tasks is adding a custom route on the following\nform `index.<namespace>`. In-order to add this route to a task you'll\nneed the following scope `queue:route:index.<namespace>`. When a task has\nthis route, it'll be indexed when the task is **completed successfully**.\nThe task will be indexed with `rank`, `data` and `expires` as specified\nin `task.extra.index`, see example below:\n\n```js\n{\n  payload:  { /* ... */ },\n  routes: [\n    // index.<namespace> prefixed routes, tasks CC'ed such a route will\n    // be indexed under the given <namespace>\n    \"index.mozilla-central.linux-64.release-build\",\n    \"index.<revision>.linux-64.release-build\"\n  ],\n  extra: {\n    // Optional details for indexing service\n    index: {\n      // Ordering, this taskId will overwrite any thing that has\n      // rank <= 4000 (defaults to zero)\n      rank:       4000,\n\n      // Specify when the entries expires (Defaults to 1 year)\n      expires:          new Date().toJSON(),\n\n      // A little informal data to store along with taskId\n      // (less 16 kb when encoded as JSON)\n      data: {\n        hgRevision:   \"...\",\n        commitMessae: \"...\",\n        whatever...\n      }\n    },\n    // Extra properties for other services...\n  }\n  // Other task properties...\n}\n```\n\n**Remark**, when indexing tasks using custom routes, it's also possible\nto listen for messages about these tasks. Which is quite convenient, for\nexample one could bind to `route.index.mozilla-central.*.release-build`,\nand pick up all messages about release builds. Hence, it is a\ngood idea to document task index hierarchies, as these make up extension\npoints in their own.",
      "baseUrl": "https://index.taskcluster.net/v1",
      "entries": [
        {
          "type": "function",
          "method": "get",
          "route": "/task/<namespace>",
          "args": [
            "namespace"
          ],
          "name": "findTask",
          "title": "Find Indexed Task",
          "description": "Find task by namespace, if no task existing for the given namespace, this\nAPI end-point respond `404`.",
          "output": "http://schemas.taskcluster.net/index/v1/indexed-task-response.json#"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/namespaces/<namespace>",
          "args": [
            "namespace"
          ],
          "name": "listNamespaces",
          "title": "List Namespaces",
          "description": "List the namespaces immediately under a given namespace. This end-point\nlist up to 1000 namespaces. If more namespaces are present a\n`continuationToken` will be returned, which can be given in the next\nrequest. For the initial request, the payload should be an empty JSON\nobject.\n\n**Remark**, this end-point is designed for humans browsing for tasks, not\nservices, as that makes little sense.",
          "input": "http://schemas.taskcluster.net/index/v1/list-namespaces-request.json#",
          "output": "http://schemas.taskcluster.net/index/v1/list-namespaces-response.json#"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/tasks/<namespace>",
          "args": [
            "namespace"
          ],
          "name": "listTasks",
          "title": "List Tasks",
          "description": "List the tasks immediately under a given namespace. This end-point\nlist up to 1000 tasks. If more tasks are present a\n`continuationToken` will be returned, which can be given in the next\nrequest. For the initial request, the payload should be an empty JSON\nobject.\n\n**Remark**, this end-point is designed for humans browsing for tasks, not\nservices, as that makes little sense.",
          "input": "http://schemas.taskcluster.net/index/v1/list-tasks-request.json#",
          "output": "http://schemas.taskcluster.net/index/v1/list-tasks-response.json#"
        },
        {
          "type": "function",
          "method": "put",
          "route": "/task/<namespace>",
          "args": [
            "namespace"
          ],
          "name": "insertTask",
          "title": "Insert Task into Index",
          "description": "Insert a task into the index. Please see the introduction above, for how\nto index successfully completed tasks automatically, using custom routes.",
          "scopes": [
            [
              "index:insert-task:<namespace>"
            ]
          ],
          "input": "http://schemas.taskcluster.net/index/v1/insert-task-request.json#",
          "output": "http://schemas.taskcluster.net/index/v1/indexed-task-response.json#"
        },
        {
          "type": "function",
          "method": "get",
          "route": "/ping",
          "args": [],
          "name": "ping",
          "title": "Ping Server",
          "description": "Documented later...\n\n**Warning** this api end-point is **not stable**."
        }
      ]
    }
  }
};