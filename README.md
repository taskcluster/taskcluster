# jsonschema2go Overview
Are you writing a service in go that needs to interpret json data, and you already have a json schema definition for the format of the json?

Typically, you would need to decode the json from an io.Reader, or unmarshal the data from a []byte in order to load the data into native go types. Regarding the go type(s) to load your data into, you can use:

1. A generic `interface{}` as your top level go type and rely on no static typing for navigating the types. This may incur some cost since you will have to explicitly cast objects into their native types when you read from them.
2. Create go types by hand to match what you see in the json schema definition, to unmarshal/decode your data into. This costs some time, but works well for small schemas that only change very infrequently.
3. Use this library to generate go types to unmarshal/decode your data into. This works well when the schema is large, or there are several of them, are they are likely to change over time.

We recommend using jsonschema2go with the go generate tool, which is go's preferred interface for automated code generation.

# Real-World Example

Here is a real-world example json schema taken from the taskcluster project:

```
{
    "id": "http://schemas.taskcluster.net/queue/v1/create-task-request.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "title": "Task Definition",
    "description": "Definition of a task that can be scheduled\n",
    "type": "object",
    "properties": {
        "provisionerId": {
            "title": "Provisioner Id",
            "description": "Unique identifier for a provisioner, that can supply specified\n`workerType`\n",
            "type": "string",
            "minLength": 1,
            "maxLength": 22,
            "pattern": "^([a-zA-Z0-9-_]*)$"
        },
        "workerType": {
            "title": "Worker Type",
            "description": "Unique identifier for a worker-type within a specific provisioner\n",
            "type": "string",
            "minLength": 1,
            "maxLength": 22,
            "pattern": "^([a-zA-Z0-9-_]*)$"
        },
        "schedulerId": {
            "title": "Scheduler Identifier",
            "description": "Identifier for the scheduler that _defined_ this task, this can be an\nidentifier for a user or a service like the `\"task-graph-scheduler\"`.\nAlong with the `taskGroupId` this is used to form the permission scope\n`queue:assume:scheduler-id:<schedulerId>/<taskGroupId>`,\nthis scope is necessary to _schedule_ a defined task, or _rerun_ a task.\n",
            "type": "string",
            "minLength": 1,
            "maxLength": 22,
            "pattern": "^([a-zA-Z0-9-_]*)$",
            "default": "-"
        },
        "taskGroupId": {
            "title": "Task-Group Identifier",
            "description": "Identifier for a group of tasks scheduled together with this task, by\nscheduler identified by `schedulerId`. For tasks scheduled by the\ntask-graph scheduler, this is the `taskGraphId`.  Defaults to `taskId` if\nproperty isn't specified.\n",
            "type": "string",
            "pattern": "^[a-zA-Z0-9-_]{22}$"
        },
        "routes": {
            "title": "Task Specific Routes",
            "description": "List of task specific routes, AMQP messages will be CC'ed to these routes.\n",
            "type": "array",
            "default": [],
            "items": {
                "title": "Task Specific Route",
                "description": "A task specific route, AMQP messages will be CC'ed with a routing key\nmatching `route.<task-specific route>`. It's possible to dot (`.`) in\nthe task specific route to make sub-keys, etc. See the RabbitMQ\n[tutorial](http://www.rabbitmq.com/tutorials/tutorial-five-python.html)\nfor examples on how to use routing-keys.\n",
                "type": "string",
                "maxLength": 249,
                "minLength": 1
            },
            "maxItems": 10,
            "uniqueItems": true
        },
        "retries": {
            "title": "Retries",
            "description": "Number of times to retry the task in case of infrastructure issues.\nAn _infrastructure issue_ is a worker node that crashes or is shutdown,\nthese events are to be expected.\n",
            "type": "integer",
            "minimum": 0,
            "maximum": 50,
            "default": 5
        },
        "created": {
            "title": "Created",
            "description": "Creation time of task",
            "type": "string",
            "format": "date-time"
        },
        "deadline": {
            "title": "Deadline",
            "description": "Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline",
            "type": "string",
            "format": "date-time"
        },
        "scopes": {
            "title": "Scopes",
            "description": "List of scopes (or scope-patterns) that the task is\nauthorized to use.\n",
            "type": "array",
            "default": [],
            "items": {
                "title": "Scope",
                "description": "A scope (or scope-patterns) which the task is\nauthorized to use. This can be a string or a string\nending with `*` which will authorize all scopes for\nwhich the string is a prefix.\n",
                "type": "string"
            }
        },
        "payload": {
            "title": "Task Payload",
            "description": "Task-specific payload following worker-specific format. For example the\n`docker-worker` requires keys like: `image`, `commands` and\n`features`. Refer to the documentation of `docker-worker` for details.\n",
            "type": "object"
        },
        "metadata": {
            "title": "Meta-data",
            "description": "Required task metadata\n",
            "type": "object",
            "properties": {
                "name": {
                    "title": "Name",
                    "description": "Human readable name of task, used to very briefly given an idea about\nwhat the task does.\n",
                    "type": "string",
                    "maxLength": 255
                },
                "description": {
                    "title": "Description",
                    "description": "Human readable description of the task, please **explain** what the\ntask does. A few lines of documentation is not going to hurt you.\n",
                    "type": "string",
                    "maxLength": 32768
                },
                "owner": {
                    "title": "Owner",
                    "description": "E-mail of person who caused this task, e.g. the person who did\n`hg push`. The person we should contact to ask why this task is here.\n",
                    "type": "string",
                    "format": "email",
                    "maxLength": 255
                },
                "source": {
                    "title": "Source",
                    "description": "Link to source of this task, should specify a file, revision and\nrepository. This should be place someone can go an do a git/hg blame\nto who came up with recipe for this task.\n",
                    "type": "string",
                    "format": "uri",
                    "maxLength": 4096
                }
            },
            "additionalProperties": false,
            "required": [
                "name",
                "description",
                "owner",
                "source"
            ]
        },
        "tags": {
            "title": "Tags",
            "description": "Arbitrary key-value tags (only strings limited to 4k). These can be used\nto attach informal meta-data to a task. Use this for informal tags that\ntasks can be classified by. You can also think of strings here as\ncandidates for formal meta-data. Something like\n`purpose: 'build' || 'test'` is a good example.\n",
            "type": "object",
            "additionalProperties": {
                "type": "string",
                "maxLength": 4096
            },
            "default": {}
        },
        "extra": {
            "title": "Extra Data",
            "description": "Object with properties that can hold any kind of extra data that should be\nassociated with the task. This can be data for the task which doesn't\nfit into `payload`, or it can supplementary data for use in services\nlistening for events from this task. For example this could be details to\ndisplay on _treeherder_, or information for indexing the task. Please, try\nto put all related information under one property, so `extra` data keys\nfor treeherder reporting and task indexing don't conflict, hence, we have\nreusable services. **Warning**, do not stuff large data-sets in here,\ntask definitions should not take-up multiple MiBs.\n",
            "type": "object",
            "default": {}
        }
    },
    "additionalProperties": false,
    "required": [
        "provisionerId",
        "workerType",
        "created",
        "deadline",
        "payload",
        "metadata"
    ]
}
```

Here is the go code which is auto-generated as part of the taskcluster-client-go project for this schema:

```go
	// Definition of a task that can be scheduled
	//
	// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#
	TaskDefinition struct {
		// Creation time of task
		Created time.Time `json:"created"`
		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline
		Deadline time.Time `json:"deadline"`
		// Object with properties that can hold any kind of extra data that should be
		// associated with the task. This can be data for the task which doesn't
		// fit into `payload`, or it can supplementary data for use in services
		// listening for events from this task. For example this could be details to
		// display on _treeherder_, or information for indexing the task. Please, try
		// to put all related information under one property, so `extra` data keys
		// for treeherder reporting and task indexing don't conflict, hence, we have
		// reusable services. **Warning**, do not stuff large data-sets in here,
		// task definitions should not take-up multiple MiBs.
		Extra interface{} `json:"extra"`
		// Required task metadata
		Metadata struct {
			// Human readable description of the task, please **explain** what the
			// task does. A few lines of documentation is not going to hurt you.
			Description string `json:"description"`
			// Human readable name of task, used to very briefly given an idea about
			// what the task does.
			Name string `json:"name"`
			// E-mail of person who caused this task, e.g. the person who did
			// `hg push`. The person we should contact to ask why this task is here.
			Owner string `json:"owner"`
			// Link to source of this task, should specify a file, revision and
			// repository. This should be place someone can go an do a git/hg blame
			// to who came up with recipe for this task.
			Source string `json:"source"`
		} `json:"metadata"`
		// Task-specific payload following worker-specific format. For example the
		// `docker-worker` requires keys like: `image`, `commands` and
		// `features`. Refer to the documentation of `docker-worker` for details.
		Payload interface{} `json:"payload"`
		// Unique identifier for a provisioner, that can supply specified
		// `workerType`
		ProvisionerId string `json:"provisionerId"`
		// Number of times to retry the task in case of infrastructure issues.
		// An _infrastructure issue_ is a worker node that crashes or is shutdown,
		// these events are to be expected.
		Retries int `json:"retries"`
		// List of task specific routes, AMQP messages will be CC'ed to these routes.
		Routes []string `json:"routes"`
		// Identifier for the scheduler that _defined_ this task, this can be an
		// identifier for a user or a service like the `"task-graph-scheduler"`.
		// Along with the `taskGroupId` this is used to form the permission scope
		// `queue:assume:scheduler-id:<schedulerId>/<taskGroupId>`,
		// this scope is necessary to _schedule_ a defined task, or _rerun_ a task.
		SchedulerId string `json:"schedulerId"`
		// List of scopes (or scope-patterns) that the task is
		// authorized to use.
		Scopes []string `json:"scopes"`
		// Arbitrary key-value tags (only strings limited to 4k). These can be used
		// to attach informal meta-data to a task. Use this for informal tags that
		// tasks can be classified by. You can also think of strings here as
		// candidates for formal meta-data. Something like
		// `purpose: 'build' || 'test'` is a good example.
		Tags interface{} `json:"tags"`
		// Identifier for a group of tasks scheduled together with this task, by
		// scheduler identified by `schedulerId`. For tasks scheduled by the
		// task-graph scheduler, this is the `taskGraphId`.  Defaults to `taskId` if
		// property isn't specified.
		TaskGroupId string `json:"taskGroupId"`
		// Unique identifier for a worker-type within a specific provisioner
		WorkerType string `json:"workerType"`
	}
```

# Installation

```
go get github.com/petemoore/jsonschema2go
```

# Usage

## Using with go generate

To use directly with go generate: include a line like this as a comment in one of your source files:

```go
//go:generate jsonschema2go -u http://schemas.taskcluster.net/queue/v1/create-task-request.json#
```

Please note there is no space between `//` and `go:generate`.

The in your build process, include the following steps:

```
go generate
go fmt
go install
```

## Running as a standalone command

```
jsonschema2go -u http://schemas.taskcluster.net/queue/v1/create-task-request.json#
```

## Using from go, as a library

```go
package main

import (
  "fmt"
  "github.com/petemoore/jsonschema2go/jsonschema2go"
)

func main() {
  err := jsonschema2go.FromURLToFile("http://some.schema.url/myschema.json", "generatedcode.go")
  if err != nil {
    fmt.Println("Whoops, something went wrong...")
    panic(err)
  }
  fmt.Println("Yay, it worked.")
}
```

# Contributing

Contributions welcome, feel free to contact me as pmoore on irc.mozilla.org, or send me a pull request.
