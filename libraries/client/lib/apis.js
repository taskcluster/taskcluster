module.exports = {
  "Auth": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://auth.taskcluster.net/v1",
      "description": "Authentication related API end-points for taskcluster.",
      "entries": [
        {
          "args": [
            "clientId"
          ],
          "description": "Returns the scopes the client is authorized to access and the date-time\nwhen the clients authorization is set to expire.\n\nThis API end-point allows you inspect clients without getting access to\ncredentials, as provided by the `getCredentials` request below.",
          "method": "get",
          "name": "scopes",
          "output": "http://schemas.taskcluster.net/auth/v1/client-scopes-response.json#",
          "route": "/client/<clientId>/scopes",
          "scopes": [
            [
              "auth:inspect",
              "auth:credentials"
            ]
          ],
          "title": "Get Client Authorized Scopes",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Returns the client's `accessToken` as needed for verifying signatures.\nThis API end-point also returns the list of scopes the client is\nauthorized for and the date-time where the client authorization expires\n\nRemark, **if you don't need** the `accessToken` but only want to see what\nscopes a client is authorized for, you should use the `getScopes`\nfunction described above.",
          "method": "get",
          "name": "getCredentials",
          "output": "http://schemas.taskcluster.net/auth/v1/client-credentials-response.json#",
          "route": "/client/<clientId>/credentials",
          "scopes": [
            [
              "auth:credentials"
            ]
          ],
          "title": "Get Client Credentials",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Returns all information about a given client. This end-point is mostly for\nbuilding tools to administrate clients. Do not use if you only want to\nauthenticate a request; see `getCredentials` for this purpose.",
          "method": "get",
          "name": "client",
          "output": "http://schemas.taskcluster.net/auth/v1/get-client-response.json#",
          "route": "/client/<clientId>",
          "scopes": [
            [
              "auth:credentials"
            ]
          ],
          "title": "Get Client Information",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Create a client with given `clientId`, `name`, `expires`, `scopes` and\n`description`. The `accessToken` will always be generated server-side,\nand will be returned from this request.\n\n**Required scopes**: in addition the scopes listed above, the \n`scopes` property must be satisfied by the caller's scopes.",
          "input": "http://schemas.taskcluster.net/auth/v1/create-client-request.json#",
          "method": "put",
          "name": "createClient",
          "output": "http://schemas.taskcluster.net/auth/v1/get-client-response.json#",
          "route": "/client/<clientId>",
          "scopes": [
            [
              "auth:create-client",
              "auth:credentials"
            ]
          ],
          "title": "Create Client",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Modify client `name`, `expires`, `scopes` and\n`description`.\n\n**Required scopes**: in addition the scopes listed\nabove, the `scopes` property must be satisfied by the caller's\nscopes.  The client's existing scopes are not considered.",
          "input": "http://schemas.taskcluster.net/auth/v1/create-client-request.json#",
          "method": "post",
          "name": "modifyClient",
          "output": "http://schemas.taskcluster.net/auth/v1/get-client-response.json#",
          "route": "/client/<clientId>/modify",
          "scopes": [
            [
              "auth:modify-client",
              "auth:credentials"
            ]
          ],
          "title": "Modify Client",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Delete a client with given `clientId`.",
          "method": "delete",
          "name": "removeClient",
          "route": "/client/<clientId>",
          "scopes": [
            [
              "auth:remove-client"
            ]
          ],
          "title": "Remove Client",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Reset credentials for a client. This will generate a new `accessToken`.\nAs always, the `accessToken` will be generated server-side and returned.",
          "method": "post",
          "name": "resetCredentials",
          "output": "http://schemas.taskcluster.net/auth/v1/get-client-response.json#",
          "route": "/client/<clientId>/reset-credentials",
          "scopes": [
            [
              "auth:reset-credentials",
              "auth:credentials"
            ]
          ],
          "title": "Reset Client Credentials",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Return a list of all clients, not including their access tokens.",
          "method": "get",
          "name": "listClients",
          "output": "http://schemas.taskcluster.net/auth/v1/list-clients-response.json#",
          "route": "/list-clients",
          "scopes": [
            [
              "auth:list-clients"
            ]
          ],
          "title": "List Clients",
          "type": "function"
        },
        {
          "args": [
            "account",
            "table"
          ],
          "description": "Get a shared access signature (SAS) string for use with a specific Azure\nTable Storage table.  Note, this will create the table, if it doesn't\nalready exist.",
          "method": "get",
          "name": "azureTableSAS",
          "output": "http://schemas.taskcluster.net/auth/v1/azure-table-access-response.json#",
          "route": "/azure/<account>/table/<table>/read-write",
          "scopes": [
            [
              "auth:azure-table-access:<account>/<table>"
            ]
          ],
          "title": "Get Shared-Access-Signature for Azure Table",
          "type": "function"
        },
        {
          "args": [
            "level",
            "bucket",
            "prefix"
          ],
          "description": "Get temporary AWS credentials for `read-write` or `read-only` access to\na given `bucket` and `prefix` within that bucket.\nThe `level` parameter can be `read-write` or `read-only` and determines\nwhich type of credentials are returned. Please note that the `level`\nparameter is required in the scope guarding access.\n\nThe credentials are set to expire after an hour, but this behavior is\nsubject to change. Hence, you should always read the `expires` property\nfrom the response, if you intend to maintain active credentials in your\napplication.\n\nPlease note that your `prefix` may not start with slash `/`. Such a prefix\nis allowed on S3, but we forbid it here to discourage bad behavior.\n\nAlso note that if your `prefix` doesn't end in a slash `/`, the STS\ncredentials may allow access to unexpected keys, as S3 does not treat\nslashes specially.  For example, a prefix of `my-folder` will allow\naccess to `my-folder/file.txt` as expected, but also to `my-folder.txt`,\nwhich may not be intended.",
          "method": "get",
          "name": "awsS3Credentials",
          "output": "http://schemas.taskcluster.net/auth/v1/aws-s3-credentials-response.json#",
          "route": "/aws/s3/<level>/<bucket>/<prefix>",
          "scopes": [
            [
              "auth:aws-s3:<level>:<bucket>/<prefix>"
            ]
          ],
          "title": "Get Temporary Read/Write Credentials S3",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Export all clients except the root client, as a JSON list.\nThis list can be imported later using `importClients`.",
          "method": "get",
          "name": "exportClients",
          "output": "http://schemas.taskcluster.net/auth/v1/exported-clients.json#",
          "route": "/export-clients",
          "scopes": [
            [
              "auth:export-clients",
              "auth:credentials"
            ]
          ],
          "title": "List Clients",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Import client from JSON list, overwriting any clients that already\nexists. Returns a list of all clients imported.",
          "input": "http://schemas.taskcluster.net/auth/v1/exported-clients.json#",
          "method": "post",
          "name": "importClients",
          "output": "http://schemas.taskcluster.net/auth/v1/exported-clients.json#",
          "route": "/import-clients",
          "scopes": [
            [
              "auth:import-clients",
              "auth:create-client",
              "auth:credentials"
            ]
          ],
          "title": "Import Clients",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Documented later...\n\n**Warning** this api end-point is **not stable**.",
          "method": "get",
          "name": "ping",
          "route": "/ping",
          "title": "Ping Server",
          "type": "function"
        }
      ],
      "title": "Authentication API",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/auth/v1/api.json"
  },
  "AwsProvisioner": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://aws-provisioner.taskcluster.net/v1",
      "description": "The AWS Provisioner is responsible for provisioning instances on EC2 for use in\nTaskCluster.  The provisioner maintains a set of worker configurations which\ncan be managed with an API that is typically available at\naws-provisioner.taskcluster.net/v1.  This API can also perform basic instance\nmanagement tasks in addition to maintaining the internal state of worker type\nconfiguration information.\n\nThe Provisioner runs at a configurable interval.  Each iteration of the\nprovisioner fetches a current copy the state that the AWS EC2 api reports.  In\neach iteration, we ask the Queue how many tasks are pending for that worker\ntype.  Based on the number of tasks pending and the scaling ratio, we may\nsubmit requests for new instances.  We use pricing information, capacity and\nutility factor information to decide which instance type in which region would\nbe the optimal configuration.\n\nEach EC2 instance type will declare a capacity and utility factor.  Capacity is\nthe number of tasks that a given machine is capable of running concurrently.\nUtility factor is a relative measure of performance between two instance types.\nWe multiply the utility factor by the spot price to compare instance types and\nregions when making the bidding choices.\n\nWhen a new EC2 instance is instantiated, its user data contains a token in\n`securityToken` that can be used with the `getSecret` method to retrieve\nthe worker's credentials and any needed passwords or other restricted\ninformation.  The worker is responsible for deleting the secret after\nretrieving it, to prevent dissemination of the secret to other proceses\nwhich can read the instance user data.\n",
      "entries": [
        {
          "args": [
            "workerType"
          ],
          "description": "Create a worker type.  A worker type contains all the configuration\nneeded for the provisioner to manage the instances.  Each worker type\nknows which regions and which instance types are allowed for that\nworker type.  Remember that Capacity is the number of concurrent tasks\nthat can be run on a given EC2 resource and that Utility is the relative\nperformance rate between different instance types.  There is no way to\nconfigure different regions to have different sets of instance types\nso ensure that all instance types are available in all regions.\nThis function is idempotent.\n\nOnce a worker type is in the provisioner, a back ground process will\nbegin creating instances for it based on its capacity bounds and its\npending task count from the Queue.  It is the worker's responsibility\nto shut itself down.  The provisioner has a limit (currently 96hours)\nfor all instances to prevent zombie instances from running indefinitely.\n\nThe provisioner will ensure that all instances created are tagged with\naws resource tags containing the provisioner id and the worker type.\n\nIf provided, the secrets in the global, region and instance type sections\nare available using the secrets api.  If specified, the scopes provided\nwill be used to generate a set of temporary credentials available with\nthe other secrets.",
          "input": "http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#",
          "method": "put",
          "name": "createWorkerType",
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#",
          "route": "/worker-type/<workerType>",
          "scopes": [
            [
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          ],
          "stability": "experimental",
          "title": "Create new Worker Type",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Provide a new copy of a worker type to replace the existing one.\nThis will overwrite the existing worker type definition if there\nis already a worker type of that name.  This method will return a\n200 response along with a copy of the worker type definition created\nNote that if you are using the result of a GET on the worker-type\nend point that you will need to delete the lastModified and workerType\nkeys from the object returned, since those fields are not allowed\nthe request body for this method\n\nOtherwise, all input requirements and actions are the same as the\ncreate method.",
          "input": "http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#",
          "method": "post",
          "name": "updateWorkerType",
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#",
          "route": "/worker-type/<workerType>/update",
          "scopes": [
            [
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          ],
          "stability": "experimental",
          "title": "Update Worker Type",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Retreive a copy of the requested worker type definition.\nThis copy contains a lastModified field as well as the worker\ntype name.  As such, it will require manipulation to be able to\nuse the results of this method to submit date to the update\nmethod.",
          "method": "get",
          "name": "workerType",
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#",
          "route": "/worker-type/<workerType>",
          "scopes": [
            [
              "aws-provisioner:view-worker-type:<workerType>"
            ],
            [
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          ],
          "stability": "experimental",
          "title": "Get Worker Type",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Delete a worker type definition.  This method will only delete\nthe worker type definition from the storage table.  The actual\ndeletion will be handled by a background worker.  As soon as this\nmethod is called for a worker type, the background worker will\nimmediately submit requests to cancel all spot requests for this\nworker type as well as killing all instances regardless of their\nstate.  If you want to gracefully remove a worker type, you must\neither ensure that no tasks are created with that worker type name\nor you could theoretically set maxCapacity to 0, though, this is\nnot a supported or tested action",
          "method": "delete",
          "name": "removeWorkerType",
          "route": "/worker-type/<workerType>",
          "scopes": [
            [
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          ],
          "stability": "experimental",
          "title": "Delete Worker Type",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Return a list of string worker type names.  These are the names\nof all managed worker types known to the provisioner.  This does\nnot include worker types which are left overs from a deleted worker\ntype definition but are still running in AWS.",
          "method": "get",
          "name": "listWorkerTypes",
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/list-worker-types-response.json#",
          "route": "/list-worker-types",
          "scopes": [
            [
              "aws-provisioner:list-worker-types"
            ]
          ],
          "stability": "experimental",
          "title": "List Worker Types",
          "type": "function"
        },
        {
          "args": [
            "token"
          ],
          "description": "Insert a secret into the secret storage.  The supplied secrets will\nbe provided verbatime via `getSecret`, while the supplied scopes will\nbe converted into credentials by `getSecret`.\n\nThis method is not ordinarily used in production; instead, the provisioner\ncreates a new secret directly for each spot bid.",
          "input": "http://schemas.taskcluster.net/aws-provisioner/v1/create-secret-request.json#",
          "method": "put",
          "name": "createSecret",
          "route": "/secret/<token>",
          "scopes": [
            [
              "aws-provisioner:create-secret"
            ]
          ],
          "stability": "experimental",
          "title": "Create new Secret",
          "type": "function"
        },
        {
          "args": [
            "token"
          ],
          "description": "Retrieve a secret from storage.  The result contains any passwords or\nother restricted information verbatim as well as a temporary credential\nbased on the scopes specified when the secret was created.\n\nIt is important that this secret is deleted by the consumer (`removeSecret`),\nor else the secrets will be visible to any process which can access the\nuser data associated with the instance.",
          "method": "get",
          "name": "getSecret",
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/get-secret-response.json#",
          "route": "/secret/<token>",
          "stability": "experimental",
          "title": "Get a Secret",
          "type": "function"
        },
        {
          "args": [
            "instanceId",
            "token"
          ],
          "description": "An instance will report in by giving its instance id as well\nas its security token.  The token is given and checked to ensure\nthat it matches a real token that exists to ensure that random\nmachines do not check in.  We could generate a different token\nbut that seems like overkill",
          "method": "get",
          "name": "instanceStarted",
          "route": "/instance-started/<instanceId>/<token>",
          "stability": "experimental",
          "title": "Report an instance starting",
          "type": "function"
        },
        {
          "args": [
            "token"
          ],
          "description": "Remove a secret.  After this call, a call to `getSecret` with the given\ntoken will return no information.\n\nIt is very important that the consumer of a \nsecret delete the secret from storage before handing over control\nto untrusted processes to prevent credential and/or secret leakage.",
          "method": "delete",
          "name": "removeSecret",
          "route": "/secret/<token>",
          "stability": "experimental",
          "title": "Remove a Secret",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "This method returns a preview of all possible launch specifications\nthat this worker type definition could submit to EC2.  It is used to\ntest worker types, nothing more\n\n**This API end-point is experimental and may be subject to change without warning.**",
          "method": "get",
          "name": "getLaunchSpecs",
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/get-launch-specs-response.json#",
          "route": "/worker-type/<workerType>/launch-specifications",
          "scopes": [
            [
              "aws-provisioner:view-worker-type:<workerType>"
            ],
            [
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          ],
          "stability": "experimental",
          "title": "Get All Launch Specifications for WorkerType",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "This method is a left over and will be removed as soon as the\ntools.tc.net UI is updated to use the per-worker state\n\n**DEPRECATED.**",
          "method": "get",
          "name": "awsState",
          "route": "/aws-state",
          "scopes": [
            [
              "aws-provisioner:aws-state"
            ]
          ],
          "stability": "experimental",
          "title": "Get AWS State for all worker types",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Return the state of a given workertype as stored by the provisioner. \nThis state is stored as three lists: 1 for all instances, 1 for requests\nwhich show in the ec2 api and 1 list for those only tracked internally\nin the provisioner.",
          "method": "get",
          "name": "state",
          "route": "/state/<workerType>",
          "scopes": [
            [
              "aws-provisioner:view-worker-type:<workerType>"
            ]
          ],
          "stability": "experimental",
          "title": "Get AWS State for a worker type",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Documented later...\n\n**Warning** this api end-point is **not stable**.",
          "method": "get",
          "name": "ping",
          "route": "/ping",
          "stability": "experimental",
          "title": "Ping Server",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Get an API reference!\n\n**Warning** this api end-point is **not stable**.",
          "method": "get",
          "name": "apiReference",
          "route": "/api-reference",
          "stability": "experimental",
          "title": "api reference",
          "type": "function"
        }
      ],
      "title": "AWS Provisioner API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/aws-provisioner/v1/api.json"
  },
  "AwsProvisionerEvents": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#",
      "description": "Exchanges from the provisioner... more docs later",
      "entries": [
        {
          "description": "When a new `workerType` is created a message will be published to this\nexchange.",
          "exchange": "worker-type-created",
          "name": "workerTypeCreated",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "WorkerType that this message concerns."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/aws-provisioner/v1/worker-type-message.json#",
          "title": "WorkerType Created Message",
          "type": "topic-exchange"
        },
        {
          "description": "When a `workerType` is updated a message will be published to this\nexchange.",
          "exchange": "worker-type-updated",
          "name": "workerTypeUpdated",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "WorkerType that this message concerns."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/aws-provisioner/v1/worker-type-message.json#",
          "title": "WorkerType Updated Message",
          "type": "topic-exchange"
        },
        {
          "description": "When a `workerType` is removed a message will be published to this\nexchange.",
          "exchange": "worker-type-removed",
          "name": "workerTypeRemoved",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "WorkerType that this message concerns."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/aws-provisioner/v1/worker-type-message.json#",
          "title": "WorkerType Removed Message",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-aws-provisioner/",
      "title": "AWS Provisioner Pulse Exchanges",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/aws-provisioner/v1/exchanges.json"
  },
  "Index": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://index.taskcluster.net/v1",
      "description": "The task index, typically available at `index.taskcluster.net`, is\nresponsible for indexing tasks. In order to ensure that tasks can be\nlocated by recency and/or arbitrary strings. Common use-cases includes\n\n * Locate tasks by git or mercurial `<revision>`, or\n * Locate latest task from given `<branch>`, such as a release.\n\n**Index hierarchy**, tasks are indexed in a dot `.` separated hierarchy\ncalled a namespace. For example a task could be indexed in\n`<revision>.linux-64.release-build`. In this case the following\nnamespaces is created.\n\n 1. `<revision>`, and,\n 2. `<revision>.linux-64`\n\nThe inside the namespace `<revision>` you can find the namespace\n`<revision>.linux-64` inside which you can find the indexed task\n`<revision>.linux-64.release-build`. In this example you'll be able to\nfind build for a given revision.\n\n**Task Rank**, when a task is indexed, it is assigned a `rank` (defaults\nto `0`). If another task is already indexed in the same namespace with\nthe same lower or equal `rank`, the task will be overwritten. For example\nconsider a task indexed as `mozilla-central.linux-64.release-build`, in\nthis case on might choose to use a unix timestamp or mercurial revision\nnumber as `rank`. This way the latest completed linux 64 bit release\nbuild is always available at `mozilla-central.linux-64.release-build`.\n\n**Indexed Data**, when a task is located in the index you will get the\n`taskId` and an additional user-defined JSON blob that was indexed with\ntask. You can use this to store additional information you would like to\nget additional from the index.\n\n**Entry Expiration**, all indexed entries must have an expiration date.\nTypically this defaults to one year, if not specified. If you are\nindexing tasks to make it easy to find artifacts, consider using the\nexpiration date that the artifacts is assigned.\n\n**Valid Characters**, all keys in a namespace `<key1>.<key2>` must be\nin the form `/[a-zA-Z0-9_!~*'()%-]+/`. Observe that this is URL-safe and\nthat if you strictly want to put another character you can URL encode it.\n\n**Indexing Routes**, tasks can be indexed using the API below, but the\nmost common way to index tasks is adding a custom route on the following\nform `index.<namespace>`. In-order to add this route to a task you'll\nneed the following scope `queue:route:index.<namespace>`. When a task has\nthis route, it'll be indexed when the task is **completed successfully**.\nThe task will be indexed with `rank`, `data` and `expires` as specified\nin `task.extra.index`, see example below:\n\n```js\n{\n  payload:  { /* ... */ },\n  routes: [\n    // index.<namespace> prefixed routes, tasks CC'ed such a route will\n    // be indexed under the given <namespace>\n    \"index.mozilla-central.linux-64.release-build\",\n    \"index.<revision>.linux-64.release-build\"\n  ],\n  extra: {\n    // Optional details for indexing service\n    index: {\n      // Ordering, this taskId will overwrite any thing that has\n      // rank <= 4000 (defaults to zero)\n      rank:       4000,\n\n      // Specify when the entries expires (Defaults to 1 year)\n      expires:          new Date().toJSON(),\n\n      // A little informal data to store along with taskId\n      // (less 16 kb when encoded as JSON)\n      data: {\n        hgRevision:   \"...\",\n        commitMessae: \"...\",\n        whatever...\n      }\n    },\n    // Extra properties for other services...\n  }\n  // Other task properties...\n}\n```\n\n**Remark**, when indexing tasks using custom routes, it's also possible\nto listen for messages about these tasks. Which is quite convenient, for\nexample one could bind to `route.index.mozilla-central.*.release-build`,\nand pick up all messages about release builds. Hence, it is a\ngood idea to document task index hierarchies, as these make up extension\npoints in their own.",
      "entries": [
        {
          "args": [
            "namespace"
          ],
          "description": "Find task by namespace, if no task existing for the given namespace, this\nAPI end-point respond `404`.",
          "method": "get",
          "name": "findTask",
          "output": "http://schemas.taskcluster.net/index/v1/indexed-task-response.json#",
          "route": "/task/<namespace>",
          "title": "Find Indexed Task",
          "type": "function"
        },
        {
          "args": [
            "namespace"
          ],
          "description": "List the namespaces immediately under a given namespace. This end-point\nlist up to 1000 namespaces. If more namespaces are present a\n`continuationToken` will be returned, which can be given in the next\nrequest. For the initial request, the payload should be an empty JSON\nobject.\n\n**Remark**, this end-point is designed for humans browsing for tasks, not\nservices, as that makes little sense.",
          "input": "http://schemas.taskcluster.net/index/v1/list-namespaces-request.json#",
          "method": "post",
          "name": "listNamespaces",
          "output": "http://schemas.taskcluster.net/index/v1/list-namespaces-response.json#",
          "route": "/namespaces/<namespace>",
          "title": "List Namespaces",
          "type": "function"
        },
        {
          "args": [
            "namespace"
          ],
          "description": "List the tasks immediately under a given namespace. This end-point\nlist up to 1000 tasks. If more tasks are present a\n`continuationToken` will be returned, which can be given in the next\nrequest. For the initial request, the payload should be an empty JSON\nobject.\n\n**Remark**, this end-point is designed for humans browsing for tasks, not\nservices, as that makes little sense.",
          "input": "http://schemas.taskcluster.net/index/v1/list-tasks-request.json#",
          "method": "post",
          "name": "listTasks",
          "output": "http://schemas.taskcluster.net/index/v1/list-tasks-response.json#",
          "route": "/tasks/<namespace>",
          "title": "List Tasks",
          "type": "function"
        },
        {
          "args": [
            "namespace"
          ],
          "description": "Insert a task into the index. Please see the introduction above, for how\nto index successfully completed tasks automatically, using custom routes.",
          "input": "http://schemas.taskcluster.net/index/v1/insert-task-request.json#",
          "method": "put",
          "name": "insertTask",
          "output": "http://schemas.taskcluster.net/index/v1/indexed-task-response.json#",
          "route": "/task/<namespace>",
          "scopes": [
            [
              "index:insert-task:<namespace>"
            ]
          ],
          "title": "Insert Task into Index",
          "type": "function"
        },
        {
          "args": [
            "namespace",
            "name"
          ],
          "description": "Find task by namespace and redirect to artifact with given `name`,\nif no task existing for the given namespace, this API end-point respond\n`404`.",
          "method": "get",
          "name": "findArtifactFromTask",
          "route": "/task/<namespace>/artifacts/<name>",
          "scopes": [
            [
              "queue:get-artifact:<name>"
            ]
          ],
          "title": "Get Artifact From Indexed Task",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Documented later...\n\n**Warning** this api end-point is **not stable**.",
          "method": "get",
          "name": "ping",
          "route": "/ping",
          "title": "Ping Server",
          "type": "function"
        }
      ],
      "title": "Task Index API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/index/v1/api.json"
  },
  "PurgeCache": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://purge-cache.taskcluster.net/v1",
      "description": "The purge-cache service, typically available at\n`purge-cache.taskcluster.net`, is responsible for publishing a pulse\nmessage for workers, so they can purge cache upon request.\n\nThis document describes the API end-point for publishing the pulse\nmessage. This is mainly intended to be used by tools.",
      "entries": [
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "Publish a purge-cache message to purge caches named `cacheName` with\n`provisionerId` and `workerType` in the routing-key. Workers should\nbe listening for this message and purge caches when they see it.",
          "input": "http://schemas.taskcluster.net/purge-cache/v1/purge-cache-request.json#",
          "method": "post",
          "name": "purgeCache",
          "route": "/purge-cache/<provisionerId>/<workerType>",
          "scopes": [
            [
              "purge-cache:<provisionerId>/<workerType>:<cacheName>"
            ]
          ],
          "title": "Purge Worker Cache",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Documented later...\n\n**Warning** this api end-point is **not stable**.",
          "method": "get",
          "name": "ping",
          "route": "/ping",
          "title": "Ping Server",
          "type": "function"
        }
      ],
      "title": "Purge Cache API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/purge-cache/v1/api.json"
  },
  "PurgeCacheEvents": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#",
      "description": "The purge-cache service, typically available at\n`purge-cache.taskcluster.net`, is responsible for publishing a pulse\nmessage for workers, so they can purge cache upon request.\n\nThis document describes the exchange offered for workers by the\ncache-purge service.",
      "entries": [
        {
          "description": "When a cache purge is requested  a message will be posted on this\nexchange with designated `provisionerId` and `workerType` in the\nrouting-key and the name of the `cacheFolder` as payload",
          "exchange": "purge-cache",
          "name": "purgeCache",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` under which to purge cache."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` for which to purge cache."
            }
          ],
          "schema": "http://schemas.taskcluster.net/purge-cache/v1/purge-cache-message.json#",
          "title": "Purge Cache Messages",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-purge-cache/v1/",
      "title": "Purge-Cache Exchanges",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/purge-cache/v1/exchanges.json"
  },
  "Queue": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://queue.taskcluster.net/v1",
      "description": "The queue, typically available at `queue.taskcluster.net`, is responsible\nfor accepting tasks and track their state as they are executed by\nworkers. In order ensure they are eventually resolved.\n\nThis document describes the API end-points offered by the queue. These \nend-points targets the following audience:\n * Schedulers, who create tasks to be executed,\n * Workers, who execute tasks, and\n * Tools, that wants to inspect the state of a task.",
      "entries": [
        {
          "args": [
            "taskId"
          ],
          "description": "This end-point will return the task-definition. Notice that the task\ndefinition may have been modified by queue, if an optional property isn't\nspecified the queue may provide a default value.",
          "method": "get",
          "name": "task",
          "output": "http://schemas.taskcluster.net/queue/v1/task.json#",
          "route": "/task/<taskId>",
          "stability": "experimental",
          "title": "Get Task Definition",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "Get task status structure from `taskId`",
          "method": "get",
          "name": "status",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "route": "/task/<taskId>/status",
          "stability": "experimental",
          "title": "Get task status",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "Create a new task, this is an **idempotent** operation, so repeat it if\nyou get an internal server error or network connection is dropped.\n\n**Task `deadline´**, the deadline property can be no more than 5 days\ninto the future. This is to limit the amount of pending tasks not being\ntaken care of. Ideally, you should use a much shorter deadline.\n\n**Task expiration**, the `expires` property must be greater than the\ntask `deadline`. If not provided it will default to `deadline` + one\nyear. Notice, that artifacts created by task must expire before the task.\n\n**Task specific routing-keys**, using the `task.routes` property you may\ndefine task specific routing-keys. If a task has a task specific \nrouting-key: `<route>`, then the poster will be required to posses the\nscope `queue:route:<route>`. And when the an AMQP message about the task\nis published the message will be CC'ed with the routing-key: \n`route.<route>`. This is useful if you want another component to listen\nfor completed tasks you have posted.",
          "input": "http://schemas.taskcluster.net/queue/v1/create-task-request.json#",
          "method": "put",
          "name": "createTask",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "route": "/task/<taskId>",
          "scopes": [
            [
              "queue:create-task:<provisionerId>/<workerType>"
            ]
          ],
          "stability": "experimental",
          "title": "Create New Task",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "Define a task without scheduling it. This API end-point allows you to\nupload a task definition without having scheduled. The task won't be\nreported as pending until it is scheduled, see the scheduleTask API \nend-point.\n\nThe purpose of this API end-point is allow schedulers to upload task\ndefinitions without the tasks becoming _pending_ immediately. This useful\nif you have a set of dependent tasks. Then you can upload all the tasks\nand when the dependencies of a tasks have been resolved, you can schedule\nthe task by calling `/task/:taskId/schedule`. This eliminates the need to\nstore tasks somewhere else while waiting for dependencies to resolve.\n\n**Note** this operation is **idempotent**, as long as you upload the same\ntask definition as previously defined this operation is safe to retry.",
          "input": "http://schemas.taskcluster.net/queue/v1/create-task-request.json#",
          "method": "post",
          "name": "defineTask",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "route": "/task/<taskId>/define",
          "scopes": [
            [
              "queue:define-task:<provisionerId>/<workerType>"
            ],
            [
              "queue:create-task:<provisionerId>/<workerType>"
            ]
          ],
          "stability": "experimental",
          "title": "Define Task",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "If you have define a task using `defineTask` API end-point, then you\ncan schedule the task to be scheduled using this method.\nThis will announce the task as pending and workers will be allowed, to\nclaim it and resolved the task.\n\n**Note** this operation is **idempotent** and will not fail or complain\nif called with `taskId` that is already scheduled, or even resolved.\nTo reschedule a task previously resolved, use `rerunTask`.",
          "method": "post",
          "name": "scheduleTask",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "route": "/task/<taskId>/schedule",
          "scopes": [
            [
              "queue:schedule-task",
              "assume:scheduler-id:<schedulerId>/<taskGroupId>"
            ]
          ],
          "stability": "experimental",
          "title": "Schedule Defined Task",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "This method _reruns_ a previously resolved task, even if it was\n_completed_. This is useful if your task completes unsuccessfully, and\nyou just want to run it from scratch again. This will also reset the\nnumber of `retries` allowed.\n\nRemember that `retries` in the task status counts the number of runs that\nthe queue have started because the worker stopped responding, for example\nbecause a spot node died.\n\n**Remark** this operation is idempotent, if you try to rerun a task that\nisn't either `failed` or `completed`, this operation will just return the\ncurrent task status.",
          "method": "post",
          "name": "rerunTask",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "route": "/task/<taskId>/rerun",
          "scopes": [
            [
              "queue:rerun-task",
              "assume:scheduler-id:<schedulerId>/<taskGroupId>"
            ]
          ],
          "stability": "experimental",
          "title": "Rerun a Resolved Task",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "This method will cancel a task that is either `unscheduled`, `pending` or\n`running`. It will resolve the current run as `exception` with\n`reasonResolved` set to `canceled`. If the task isn't scheduled yet, ie.\nit doesn't have any runs, an initial run will be added and resolved as\ndescribed above. Hence, after canceling a task, it cannot be scheduled\nwith `queue.scheduleTask`, but a new run can be created with\n`queue.rerun`. These semantics is equivalent to calling\n`queue.scheduleTask` immediately followed by `queue.cancelTask`.\n\n**Remark** this operation is idempotent, if you try to cancel a task that\nisn't `unscheduled`, `pending` or `running`, this operation will just\nreturn the current task status.",
          "method": "post",
          "name": "cancelTask",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "route": "/task/<taskId>/cancel",
          "scopes": [
            [
              "queue:cancel-task",
              "assume:scheduler-id:<schedulerId>/<taskGroupId>"
            ]
          ],
          "stability": "experimental",
          "title": "Cancel Task",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "Get a signed URLs to get and delete messages from azure queue.\nOnce messages are polled from here, you can claim the referenced task\nwith `claimTask`, and afterwards you should always delete the message.",
          "method": "get",
          "name": "pollTaskUrls",
          "output": "http://schemas.taskcluster.net/queue/v1/poll-task-urls-response.json#",
          "route": "/poll-task-url/<provisionerId>/<workerType>",
          "scopes": [
            [
              "queue:poll-task-urls",
              "assume:worker-type:<provisionerId>/<workerType>"
            ]
          ],
          "stability": "experimental",
          "title": "Get Urls to Poll Pending Tasks",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "claim a task, more to be added later...",
          "input": "http://schemas.taskcluster.net/queue/v1/task-claim-request.json#",
          "method": "post",
          "name": "claimTask",
          "output": "http://schemas.taskcluster.net/queue/v1/task-claim-response.json#",
          "route": "/task/<taskId>/runs/<runId>/claim",
          "scopes": [
            [
              "queue:claim-task",
              "assume:worker-type:<provisionerId>/<workerType>",
              "assume:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "stability": "experimental",
          "title": "Claim task",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "reclaim a task more to be added later...",
          "method": "post",
          "name": "reclaimTask",
          "output": "http://schemas.taskcluster.net/queue/v1/task-claim-response.json#",
          "route": "/task/<taskId>/runs/<runId>/reclaim",
          "scopes": [
            [
              "queue:claim-task",
              "assume:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "stability": "experimental",
          "title": "Reclaim task",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "Report a task completed, resolving the run as `completed`.",
          "method": "post",
          "name": "reportCompleted",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "route": "/task/<taskId>/runs/<runId>/completed",
          "scopes": [
            [
              "queue:resolve-task",
              "assume:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "stability": "experimental",
          "title": "Report Run Completed",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "Report a run failed, resolving the run as `failed`. Use this to resolve\na run that failed because the task specific code behaved unexpectedly.\nFor example the task exited non-zero, or didn't produce expected output.\n\nDon't use this if the task couldn't be run because if malformed payload,\nor other unexpected condition. In these cases we have a task exception,\nwhich should be reported with `reportException`.",
          "method": "post",
          "name": "reportFailed",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "route": "/task/<taskId>/runs/<runId>/failed",
          "scopes": [
            [
              "queue:resolve-task",
              "assume:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "stability": "experimental",
          "title": "Report Run Failed",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "Resolve a run as _exception_. Generally, you will want to report tasks as\nfailed instead of exception. You should `reportException` if,\n\n  * The `task.payload` is invalid,\n  * Non-existent resources are referenced,\n  * Declared actions cannot be executed due to unavailable resources,\n  * The worker had to shutdown prematurely, or,\n  * The worker experienced an unknown error.\n\nDo not use this to signal that some user-specified code crashed for any\nreason specific to this code. If user-specific code hits a resource that\nis temporarily unavailable worker should report task _failed_.",
          "input": "http://schemas.taskcluster.net/queue/v1/task-exception-request.json#",
          "method": "post",
          "name": "reportException",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "route": "/task/<taskId>/runs/<runId>/exception",
          "scopes": [
            [
              "queue:resolve-task",
              "assume:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "stability": "experimental",
          "title": "Report Task Exception",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId",
            "name"
          ],
          "description": "This API end-point creates an artifact for a specific run of a task. This\nshould **only** be used by a worker currently operating on this task, or\nfrom a process running within the task (ie. on the worker).\n\nAll artifacts must specify when they `expires`, the queue will\nautomatically take care of deleting artifacts past their\nexpiration point. This features makes it feasible to upload large\nintermediate artifacts from data processing applications, as the\nartifacts can be set to expire a few days later.\n\nWe currently support 4 different `storageType`s, each storage type have\nslightly different features and in some cases difference semantics.\n\n**S3 artifacts**, is useful for static files which will be stored on S3.\nWhen creating an S3 artifact the queue will return a pre-signed URL\nto which you can do a `PUT` request to upload your artifact. Note\nthat `PUT` request **must** specify the `content-length` header and\n**must** give the `content-type` header the same value as in the request\nto `createArtifact`.\n\n**Azure artifacts**, are stored in _Azure Blob Storage_ service, which\ngiven the consistency guarantees and API interface offered by Azure is\nmore suitable for artifacts that will be modified during the execution\nof the task. For example docker-worker has a feature that persists the\ntask log to Azure Blob Storage every few seconds creating a somewhat\nlive log. A request to create an Azure artifact will return a URL\nfeaturing a [Shared-Access-Signature](http://msdn.microsoft.com/en-us/library/azure/dn140256.aspx),\nrefer to MSDN for further information on how to use these.\n**Warning: azure artifact is currently an experimental feature subject\nto changes and data-drops.**\n\n**Reference artifacts**, only consists of meta-data which the queue will\nstore for you. These artifacts really only have a `url` property and\nwhen the artifact is requested the client will be redirect the URL\nprovided with a `303` (See Other) redirect. Please note that we cannot\ndelete artifacts you upload to other service, we can only delete the\nreference to the artifact, when it expires.\n\n**Error artifacts**, only consists of meta-data which the queue will\nstore for you. These artifacts are only meant to indicate that you the\nworker or the task failed to generate a specific artifact, that you\nwould otherwise have uploaded. For example docker-worker will upload an\nerror artifact, if the file it was supposed to upload doesn't exists or\nturns out to be a directory. Clients requesting an error artifact will\nget a `403` (Forbidden) response. This is mainly designed to ensure that\ndependent tasks can distinguish between artifacts that were suppose to\nbe generated and artifacts for which the name is misspelled.\n\n**Artifact immutability**, generally speaking you cannot overwrite an\nartifact when created. But if you repeat the request with the same\nproperties the request will succeed as the operation is idempotent.\nThis is useful if you need to refresh a signed URL while uploading.\nDo not abuse this to overwrite artifacts created by another entity!\nSuch as worker-host overwriting artifact created by worker-code.\n\nAs a special case the `url` property on _reference artifacts_ can be\nupdated. You should only use this to update the `url` property for\nreference artifacts your process has created.",
          "input": "http://schemas.taskcluster.net/queue/v1/post-artifact-request.json#",
          "method": "post",
          "name": "createArtifact",
          "output": "http://schemas.taskcluster.net/queue/v1/post-artifact-response.json#",
          "route": "/task/<taskId>/runs/<runId>/artifacts/<name>",
          "scopes": [
            [
              "queue:create-artifact:<name>",
              "assume:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "stability": "experimental",
          "title": "Create Artifact",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId",
            "name"
          ],
          "description": "Get artifact by `<name>` from a specific run.\n\n**Public Artifacts**, in-order to get an artifact you need the scope\n`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.\nBut if the artifact `name` starts with `public/`, authentication and\nauthorization is not necessary to fetch the artifact.\n\n**API Clients**, this method will redirect you to the artifact, if it is\nstored externally. Either way, the response may not be JSON. So API\nclient users might want to generate a signed URL for this end-point and\nuse that URL with a normal HTTP client.",
          "method": "get",
          "name": "getArtifact",
          "route": "/task/<taskId>/runs/<runId>/artifacts/<name>",
          "scopes": [
            [
              "queue:get-artifact:<name>"
            ]
          ],
          "stability": "experimental",
          "title": "Get Artifact from Run",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "name"
          ],
          "description": "Get artifact by `<name>` from the last run of a task.\n\n**Public Artifacts**, in-order to get an artifact you need the scope\n`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.\nBut if the artifact `name` starts with `public/`, authentication and\nauthorization is not necessary to fetch the artifact.\n\n**API Clients**, this method will redirect you to the artifact, if it is\nstored externally. Either way, the response may not be JSON. So API\nclient users might want to generate a signed URL for this end-point and\nuse that URL with a normal HTTP client.\n\n**Remark**, this end-point is slightly slower than\n`queue.getArtifact`, so consider that if you already know the `runId` of\nthe latest run. Otherwise, just us the most convenient API end-point.",
          "method": "get",
          "name": "getLatestArtifact",
          "route": "/task/<taskId>/artifacts/<name>",
          "scopes": [
            [
              "queue:get-artifact:<name>"
            ]
          ],
          "stability": "experimental",
          "title": "Get Artifact from Latest Run",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "Returns a list of artifacts and associated meta-data for a given run.",
          "method": "get",
          "name": "listArtifacts",
          "output": "http://schemas.taskcluster.net/queue/v1/list-artifacts-response.json#",
          "route": "/task/<taskId>/runs/<runId>/artifacts",
          "stability": "experimental",
          "title": "Get Artifacts from Run",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "Returns a list of artifacts and associated meta-data for the latest run\nfrom the given task.",
          "method": "get",
          "name": "listLatestArtifacts",
          "output": "http://schemas.taskcluster.net/queue/v1/list-artifacts-response.json#",
          "route": "/task/<taskId>/artifacts",
          "stability": "experimental",
          "title": "Get Artifacts from Latest Run",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "Documented later...\nThis probably the end-point that will remain after rewriting to azure\nqueue storage...\n",
          "method": "get",
          "name": "pendingTasks",
          "output": "http://schemas.taskcluster.net/queue/v1/pending-tasks-response.json#",
          "route": "/pending/<provisionerId>/<workerType>",
          "scopes": [
            [
              "queue:pending-tasks:<provisionerId>/<workerType>"
            ]
          ],
          "stability": "experimental",
          "title": "Get Number of Pending Tasks",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Documented later...\n\n**Warning** this api end-point is **not stable**.",
          "method": "get",
          "name": "ping",
          "route": "/ping",
          "stability": "experimental",
          "title": "Ping Server",
          "type": "function"
        }
      ],
      "title": "Queue API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/queue/v1/api.json"
  },
  "QueueEvents": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#",
      "description": "The queue, typically available at `queue.taskcluster.net`, is responsible\nfor accepting tasks and track their state as they are executed by\nworkers. In order ensure they are eventually resolved.\n\nThis document describes AMQP exchanges offered by the queue, which allows\nthird-party listeners to monitor tasks as they progress to resolution.\nThese exchanges targets the following audience:\n * Schedulers, who takes action after tasks are completed,\n * Workers, who wants to listen for new or canceled tasks (optional),\n * Tools, that wants to update their view as task progress.\n\nYou'll notice that all the exchanges in the document shares the same\nrouting key pattern. This makes it very easy to bind to all messages\nabout a certain kind tasks.\n\n**Task-graphs**, if the task-graph scheduler, documented elsewhere, is\nused to schedule a task-graph, the task submitted will have their\n`schedulerId` set to `'task-graph-scheduler'`, and their `taskGroupId` to\nthe `taskGraphId` as given to the task-graph scheduler. This is useful if\nyou wish to listen for all messages in a specific task-graph.\n\n**Task specific routes**, a task can define a task specific route using\nthe `task.routes` property. See task creation documentation for details\non permissions required to provide task specific routes. If a task has\nthe entry `'notify.by-email'` in as task specific route defined in\n`task.routes` all messages about this task will be CC'ed with the\nrouting-key `'route.notify.by-email'`.\n\nThese routes will always be prefixed `route.`, so that cannot interfere\nwith the _primary_ routing key as documented here. Notice that the\n_primary_ routing key is alwasys prefixed `primary.`. This is ensured\nin the routing key reference, so API clients will do this automatically.\n\nPlease, note that the way RabbitMQ works, the message will only arrive\nin your queue once, even though you may have bound to the exchange with\nmultiple routing key patterns that matches more of the CC'ed routing\nrouting keys.\n\n**Delivery guarantees**, most operations on the queue are idempotent,\nwhich means that if repeated with the same arguments then the requests\nwill ensure completion of the operation and return the same response.\nThis is useful if the server crashes or the TCP connection breaks, but\nwhen re-executing an idempotent operation, the queue will also resend\nany related AMQP messages. Hence, messages may be repeated.\n\nThis shouldn't be much of a problem, as the best you can achieve using\nconfirm messages with AMQP is at-least-once delivery semantics. Hence,\nthis only prevents you from obtaining at-most-once delivery semantics.\n\n**Remark**, some message generated by timeouts maybe dropped if the\nserver crashes at wrong time. Ideally, we'll address this in the\nfuture. For now we suggest you ignore this corner case, and notify us\nif this corner case is of concern to you.",
      "entries": [
        {
          "description": "When a task is created or just defined a message is posted to this\nexchange.\n\nThis message exchange is mainly useful when tasks are scheduled by a\nscheduler that uses `defineTask` as this does not make the task\n`pending`. Thus, no `taskPending` message is published.\nPlease, note that messages are also published on this exchange if defined\nusing `createTask`.",
          "exchange": "task-defined",
          "name": "taskDefined",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/task-defined-message.json#",
          "title": "Task Defined Messages",
          "type": "topic-exchange"
        },
        {
          "description": "When a task becomes `pending` a message is posted to this exchange.\n\nThis is useful for workers who doesn't want to constantly poll the queue\nfor new tasks. The queue will also be authority for task states and\nclaims. But using this exchange workers should be able to distribute work\nefficiently and they would be able to reduce their polling interval\nsignificantly without affecting general responsiveness.",
          "exchange": "task-pending",
          "name": "taskPending",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": true,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/task-pending-message.json#",
          "title": "Task Pending Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Whenever a task is claimed by a worker, a run is started on the worker,\nand a message is posted on this exchange.",
          "exchange": "task-running",
          "name": "taskRunning",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": true,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": true,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": true,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/task-running-message.json#",
          "title": "Task Running Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Whenever the `createArtifact` end-point is called, the queue will create\na record of the artifact and post a message on this exchange. All of this\nhappens before the queue returns a signed URL for the caller to upload\nthe actual artifact with (pending on `storageType`).\n\nThis means that the actual artifact is rarely available when this message\nis posted. But it is not unreasonable to assume that the artifact will\nwill become available at some point later. Most signatures will expire in\n30 minutes or so, forcing the uploader to call `createArtifact` with\nthe same payload again in-order to continue uploading the artifact.\n\nHowever, in most cases (especially for small artifacts) it's very\nreasonable assume the artifact will be available within a few minutes.\nThis property means that this exchange is mostly useful for tools\nmonitoring task evaluation. One could also use it count number of\nartifacts per task, or _index_ artifacts though in most cases it'll be\nsmarter to index artifacts after the task in question have completed\nsuccessfully.",
          "exchange": "artifact-created",
          "name": "artifactCreated",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": true,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": true,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": true,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/artifact-created-message.json#",
          "title": "Artifact Creation Messages",
          "type": "topic-exchange"
        },
        {
          "description": "When a task is successfully completed by a worker a message is posted\nthis exchange.\nThis message is routed using the `runId`, `workerGroup` and `workerId`\nthat completed the task. But information about additional runs is also\navailable from the task status structure.",
          "exchange": "task-completed",
          "name": "taskCompleted",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": true,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": true,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": true,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/task-completed-message.json#",
          "title": "Task Completed Messages",
          "type": "topic-exchange"
        },
        {
          "description": "When a task ran, but failed to complete successfully a message is posted\nto this exchange. This is same as worker ran task-specific code, but the\ntask specific code exited non-zero.",
          "exchange": "task-failed",
          "name": "taskFailed",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/task-failed-message.json#",
          "title": "Task Failed Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Whenever TaskCluster fails to run a message is posted to this exchange.\nThis happens if the task isn't completed before its `deadlìne`,\nall retries failed (i.e. workers stopped responding), the task was\ncanceled by another entity, or the task carried a malformed payload.\n\nThe specific _reason_ is evident from that task status structure, refer\nto the `reasonResolved` property for the last run.",
          "exchange": "task-exception",
          "name": "taskException",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/queue/v1/task-exception-message.json#",
          "title": "Task Exception Messages",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-queue/v1/",
      "title": "Queue AMQP Exchanges",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/queue/v1/exchanges.json"
  },
  "Scheduler": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://scheduler.taskcluster.net/v1",
      "description": "The task-graph scheduler, typically available at\n`scheduler.taskcluster.net`, is responsible for accepting task-graphs and\nscheduling tasks for evaluation by the queue as their dependencies are\nsatisfied.\n\nThis document describes API end-points offered by the task-graph\nscheduler. These end-points targets the following audience:\n * Post-commit hooks, that wants to submit task-graphs for testing,\n * End-users, who wants to execute a set of dependent tasks, and\n * Tools, that wants to inspect the state of a task-graph.",
      "entries": [
        {
          "args": [
            "taskGraphId"
          ],
          "description": "Create a new task-graph, the `status` of the resulting JSON is a\ntask-graph status structure, you can find the `taskGraphId` in this\nstructure.\n\n**Referencing required tasks**, it is possible to reference other tasks\nin the task-graph that must be completed successfully before a task is\nscheduled. You just specify the `taskId` in the list of `required` tasks.\nSee the example below, where the second task requires the first task.\n```js\n{\n  ...\n  tasks: [\n    {\n      taskId:     \"XgvL0qtSR92cIWpcwdGKCA\",\n      requires:   [],\n      ...\n    },\n    {\n      taskId:     \"73GsfK62QNKAk2Hg1EEZTQ\",\n      requires:   [\"XgvL0qtSR92cIWpcwdGKCA\"],\n      task: {\n        payload: {\n          env: {\n            DEPENDS_ON:  \"XgvL0qtSR92cIWpcwdGKCA\"\n          }\n          ...\n        }\n        ...\n      },\n      ...\n    }\n  ]\n}\n```\n\n**The `schedulerId` property**, defaults to the `schedulerId` of this\nscheduler in production that is `\"task-graph-scheduler\"`. This\nproperty must be either undefined or set to `\"task-graph-scheduler\"`,\notherwise the task-graph will be rejected.\n\n**The `taskGroupId` property**, defaults to the `taskGraphId` of the\ntask-graph submitted, and if provided much be the `taskGraphId` of\nthe task-graph. Otherwise the task-graph will be rejected.\n\n**Task-graph scopes**, a task-graph is assigned a set of scopes, just\nlike tasks. Tasks within a task-graph cannot have scopes beyond those\nthe task-graph has. The task-graph scheduler will execute all requests\non behalf of a task-graph using the set of scopes assigned to the\ntask-graph. Thus, if you are submitting tasks to `my-worker-type` under\n`my-provisioner` it's important that your task-graph has the scope\nrequired to define tasks for this `provisionerId` and `workerType`.\nSee the queue for details on permissions required. Note, the task-graph\ndoes not require permissions to schedule the tasks. This is done with\nscopes provided by the task-graph scheduler.\n\n**Task-graph specific routing-keys**, using the `taskGraph.routes`\nproperty you may define task-graph specific routing-keys. If a task-graph\nhas a task-graph specific routing-key: `<route>`, then the poster will\nbe required to posses the scope `scheduler:route:<route>`. And when the\nan AMQP message about the task-graph is published the message will be\nCC'ed with the routing-key: `route.<route>`. This is useful if you want\nanother component to listen for completed tasks you have posted.",
          "input": "http://schemas.taskcluster.net/scheduler/v1/task-graph.json#",
          "method": "put",
          "name": "createTaskGraph",
          "output": "http://schemas.taskcluster.net/scheduler/v1/task-graph-status-response.json#",
          "route": "/task-graph/<taskGraphId>",
          "scopes": [
            [
              "scheduler:create-task-graph"
            ]
          ],
          "title": "Create new task-graph",
          "type": "function"
        },
        {
          "args": [
            "taskGraphId"
          ],
          "description": "Add a set of tasks to an existing task-graph. The request format is very\nsimilar to the request format for creating task-graphs. But `routes`\nkey, `scopes`, `metadata` and `tags` cannot be modified.\n\n**Referencing required tasks**, just as when task-graphs are created,\neach task has a list of required tasks. It is possible to reference\nall `taskId`s within the task-graph.\n\n**Safety,** it is only _safe_ to call this API end-point while the\ntask-graph being modified is still running. If the task-graph is\n_finished_ or _blocked_, this method will leave the task-graph in this\nstate. Hence, it is only truly _safe_ to call this API end-point from\nwithin a task in the task-graph being modified.",
          "input": "http://schemas.taskcluster.net/scheduler/v1/extend-task-graph-request.json#",
          "method": "post",
          "name": "extendTaskGraph",
          "output": "http://schemas.taskcluster.net/scheduler/v1/task-graph-status-response.json#",
          "route": "/task-graph/<taskGraphId>/extend",
          "scopes": [
            [
              "scheduler:extend-task-graph:<taskGraphId>"
            ]
          ],
          "title": "Extend existing task-graph",
          "type": "function"
        },
        {
          "args": [
            "taskGraphId"
          ],
          "description": "Get task-graph status, this will return the _task-graph status\nstructure_. which can be used to check if a task-graph is `running`,\n`blocked` or `finished`.\n\n**Note**, that `finished` implies successfully completion.",
          "method": "get",
          "name": "status",
          "output": "http://schemas.taskcluster.net/scheduler/v1/task-graph-status-response.json",
          "route": "/task-graph/<taskGraphId>/status",
          "title": "Task Graph Status",
          "type": "function"
        },
        {
          "args": [
            "taskGraphId"
          ],
          "description": "Get task-graph information, this includes the _task-graph status\nstructure_, along with `metadata` and `tags`, but not information\nabout all tasks.\n\nIf you want more detailed information use the `inspectTaskGraph`\nend-point instead.",
          "method": "get",
          "name": "info",
          "output": "http://schemas.taskcluster.net/scheduler/v1/task-graph-info-response.json",
          "route": "/task-graph/<taskGraphId>/info",
          "title": "Task Graph Information",
          "type": "function"
        },
        {
          "args": [
            "taskGraphId"
          ],
          "description": "Inspect a task-graph, this returns all the information the task-graph\nscheduler knows about the task-graph and the state of its tasks.\n\n**Warning**, some of these fields are borderline internal to the\ntask-graph scheduler and we may choose to change or make them internal\nlater. Also note that note all of the information is formalized yet.\nThe JSON schema will be updated to reflect formalized values, we think\nit's safe to consider the values stable.\n\nTake these considerations into account when using the API end-point,\nas we do not promise it will remain fully backward compatible in\nthe future.",
          "method": "get",
          "name": "inspect",
          "output": "http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json",
          "route": "/task-graph/<taskGraphId>/inspect",
          "title": "Inspect Task Graph",
          "type": "function"
        },
        {
          "args": [
            "taskGraphId",
            "taskId"
          ],
          "description": "Inspect a task from a task-graph, this returns all the information the\ntask-graph scheduler knows about the specific task.\n\n**Warning**, some of these fields are borderline internal to the\ntask-graph scheduler and we may choose to change or make them internal\nlater. Also note that note all of the information is formalized yet.\nThe JSON schema will be updated to reflect formalized values, we think\nit's safe to consider the values stable.\n\nTake these considerations into account when using the API end-point,\nas we do not promise it will remain fully backward compatible in\nthe future.",
          "method": "get",
          "name": "inspectTask",
          "output": "http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json",
          "route": "/task-graph/<taskGraphId>/inspect/<taskId>",
          "title": "Inspect Task from a Task-Graph",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Documented later...\n\n**Warning** this api end-point is **not stable**.",
          "method": "get",
          "name": "ping",
          "route": "/ping",
          "title": "Ping Server",
          "type": "function"
        }
      ],
      "title": "Task-Graph Scheduler API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/scheduler/v1/api.json"
  },
  "SchedulerEvents": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#",
      "description": "The scheduler, typically available at `scheduler.taskcluster.net` is\nresponsible for accepting task-graphs and schedule tasks on the queue as\ntheir dependencies are completed successfully.\n\nThis document describes the AMQP exchanges offered by the scheduler,\nwhich allows third-party listeners to monitor task-graph submission and\nresolution. These exchanges targets the following audience:\n * Reporters, who displays the state of task-graphs or emails people on\n   failures, and\n * End-users, who wants notification of completed task-graphs\n\n**Remark**, the task-graph scheduler will require that the `schedulerId`\nfor tasks is set to the `schedulerId` for the task-graph scheduler. In\nproduction the `schedulerId` is typically `\"task-graph-scheduler\"`.\nFurthermore, the task-graph scheduler will also require that\n`taskGroupId` is equal to the `taskGraphId`.\n\nCombined these requirements ensures that `schedulerId` and `taskGroupId`\nhave the same position in the routing keys for the queue exchanges.\nSee queue documentation for details on queue exchanges. Hence, making\nit easy to listen for all tasks in a given task-graph.\n\nNote that routing key entries 2 through 7 used for exchanges on the\ntask-graph scheduler is hardcoded to `_`. This is done to preserve\npositional equivalence with exchanges offered by the queue.",
      "entries": [
        {
          "description": "When a task-graph is submitted it immediately starts running and a\nmessage is posted on this exchange to indicate that a task-graph have\nbeen submitted.",
          "exchange": "task-graph-running",
          "name": "taskGraphRunning",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production."
            },
            {
              "multipleWords": false,
              "name": "taskGraphId",
              "required": true,
              "summary": "Identifier for the task-graph this message concerns"
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/scheduler/v1/task-graph-running-message.json#",
          "title": "Task-Graph Running Message",
          "type": "topic-exchange"
        },
        {
          "description": "When a task-graph is extended, that is additional tasks is added to the\ntask-graph, a message is posted on this exchange. This is useful if you\nare monitoring a task-graph and what to track states of the individual\ntasks in the task-graph.",
          "exchange": "task-graph-extended",
          "name": "taskGraphExtended",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production."
            },
            {
              "multipleWords": false,
              "name": "taskGraphId",
              "required": true,
              "summary": "Identifier for the task-graph this message concerns"
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/scheduler/v1/task-graph-extended-message.json#",
          "title": "Task-Graph Extended Message",
          "type": "topic-exchange"
        },
        {
          "description": "When a task is completed unsuccessfully and all reruns have been\nattempted, the task-graph will not complete successfully and it's\ndeclared to be _blocked_, by some task that consistently completes\nunsuccessfully.\n\nWhen a task-graph becomes blocked a messages is posted to this exchange.\nThe message features the `taskId` of the task that caused the task-graph\nto become blocked.",
          "exchange": "task-graph-blocked",
          "name": "taskGraphBlocked",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production."
            },
            {
              "multipleWords": false,
              "name": "taskGraphId",
              "required": true,
              "summary": "Identifier for the task-graph this message concerns"
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/scheduler/v1/task-graph-blocked-message.json#",
          "title": "Task-Graph Blocked Message",
          "type": "topic-exchange"
        },
        {
          "description": "When all tasks of a task-graph have completed successfully, the\ntask-graph is declared to be finished, and a message is posted to this\nexchange.",
          "exchange": "task-graph-finished",
          "name": "taskGraphFinished",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production."
            },
            {
              "multipleWords": false,
              "name": "taskGraphId",
              "required": true,
              "summary": "Identifier for the task-graph this message concerns"
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/scheduler/v1/task-graph-finished-message.json#",
          "title": "Task-Graph Finished Message",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-scheduler/v1/",
      "title": "Scheduler AMQP Exchanges",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/scheduler/v1/exchanges.json"
  }
};