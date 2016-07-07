# jsonschema2go
[![Build Status](https://secure.travis-ci.org/taskcluster/jsonschema2go.png)](http://travis-ci.org/taskcluster/jsonschema2go)
[![GoDoc](https://godoc.org/github.com/taskcluster/jsonschema2go?status.png)](https://godoc.org/github.com/taskcluster/jsonschema2go)
# Overview
Are you writing a service in go that needs to interpret json data, and you already have a json schema definition for the format of the json?

Typically, you would need to unmarshal the json into a go type in order to use the data. The go type could be:

1. A generic `interface{}` ... ouch
2. A hand-crafted type ... not bad
3. An auto-generated type ... even better!

This library auto-generates your go types for you.

# Real-World Example

Here is a real-world example json schema taken from the taskcluster project. Try it out yourself if you like.

First, let's see the schema:

```
$ curl 'http://schemas.taskcluster.net/queue/v1/create-task-request.json'
{
    "$schema": "http://json-schema.org/draft-04/schema#",
    "title": "Task Definition Request",
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
            "description": "Identifier for the scheduler that _defined_ this task, this can be an\nidentifier for a user or a service like the `\"task-graph-scheduler\"`.\n**Task submitter required scopes**\n`queue:assume:scheduler-id:<schedulerId>/<taskGroupId>`.\nThis scope is also necessary to _schedule_ a defined task, or _rerun_ a\ntask.\n",
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
            "pattern": "^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$"
        },
        "dependencies": {
            "title": "Task Dependencies",
            "description": "List of dependent tasks. These must either be _completed_ or _resolved_\nbefore this task is scheduled. See `requires` for semantics.\n",
            "type": "array",
            "default": [],
            "items": {
                "title": "Task Dependency",
                "description": "The `taskId` of a task that must be resolved before this task is\nscheduled.\n",
                "type": "string",
                "pattern": "^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$"
            },
            "maxItems": 100,
            "uniqueItems": true
        },
        "requires": {
            "title": "Dependency Requirement Semantics",
            "description": "The tasks relation to its dependencies. This property specifies the\nsemantics of the `task.dependencies` property.\nIf `all-completed` is given the task will be scheduled when all\ndependencies are resolved _completed_ (successful resolution).\nIf `all-resolved` is given the task will be scheduled when all dependencies\nhave been resolved, regardless of what their resolution is.\n",
            "type": "string",
            "enum": [
                "all-completed",
                "all-resolved"
            ],
            "default": "all-completed"
        },
        "routes": {
            "title": "Task Specific Routes",
            "description": "List of task specific routes, AMQP messages will be CC'ed to these routes.\n**Task submitter required scopes** `queue:route:<route>` for\neach route given.\n",
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
        "priority": {
            "title": "Task Priority",
            "description": "Priority of task, this defaults to `normal`. Additional levels may be\nadded later.\n**Task submitter required scopes** `queue:task-priority:high` for high\npriority tasks.\n",
            "type": "string",
            "enum": [
                "high",
                "normal"
            ],
            "default": "normal"
        },
        "retries": {
            "title": "Retries",
            "description": "Number of times to retry the task in case of infrastructure issues.\nAn _infrastructure issue_ is a worker node that crashes or is shutdown,\nthese events are to be expected.\n",
            "type": "integer",
            "minimum": 0,
            "maximum": 49,
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
            "description": "Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline. Note, deadline cannot be more than5 days into the future",
            "type": "string",
            "format": "date-time"
        },
        "expires": {
            "title": "Expiration",
            "description": "Task expiration, time at which task definition and status is deleted.\nNotice that all artifacts for the must have an expiration that is no\nlater than this. If this property isn't it will be set to `deadline`\nplus one year (this default may subject to change).\n",
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
                "description": "A scope (or scope-patterns) which the task is\nauthorized to use. This can be a string or a string\nending with `*` which will authorize all scopes for\nwhich the string is a prefix.  Scopes must be composed of\nprintable ASCII characters and spaces.\n**Task submitter required scopes** The same scope-pattern(s) given\n(otherwise a task could be submitted to perform an action that the\ntask submitter is not authorized to perform).\n",
                "type": "string",
                "pattern": "^[\\x20-\\x7e]*$"
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
    ],
    "id": "http://schemas.taskcluster.net/queue/v1/create-task-request.json#"
}
```

And now we run jsonschema2go to generate the go type(s):

```go
$ echo 'http://schemas.taskcluster.net/queue/v1/create-task-request.json' | jsonschema2go -o main
// This source code file is AUTO-GENERATED by github.com/taskcluster/jsonschema2go

package main

import (
	"encoding/json"
	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type (
	// Definition of a task that can be scheduled
	//
	// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#
	TaskDefinitionRequest struct {

		// Creation time of task
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/created
		Created tcclient.Time `json:"created"`

		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline. Note, deadline cannot be more than5 days into the future
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/deadline
		Deadline tcclient.Time `json:"deadline"`

		// List of dependent tasks. These must either be _completed_ or _resolved_
		// before this task is scheduled. See `requires` for semantics.
		//
		// Default:    []
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/dependencies
		Dependencies []string `json:"dependencies,omitempty"`

		// Task expiration, time at which task definition and status is deleted.
		// Notice that all artifacts for the must have an expiration that is no
		// later than this. If this property isn't it will be set to `deadline`
		// plus one year (this default may subject to change).
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/expires
		Expires tcclient.Time `json:"expires,omitempty"`

		// Object with properties that can hold any kind of extra data that should be
		// associated with the task. This can be data for the task which doesn't
		// fit into `payload`, or it can supplementary data for use in services
		// listening for events from this task. For example this could be details to
		// display on _treeherder_, or information for indexing the task. Please, try
		// to put all related information under one property, so `extra` data keys
		// for treeherder reporting and task indexing don't conflict, hence, we have
		// reusable services. **Warning**, do not stuff large data-sets in here,
		// task definitions should not take-up multiple MiBs.
		//
		// Default:    map[]
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/extra
		Extra json.RawMessage `json:"extra,omitempty"`

		// Required task metadata
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/metadata
		Metadata struct {

			// Human readable description of the task, please **explain** what the
			// task does. A few lines of documentation is not going to hurt you.
			//
			// Max length: 32768
			//
			// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/metadata/properties/description
			Description string `json:"description"`

			// Human readable name of task, used to very briefly given an idea about
			// what the task does.
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/metadata/properties/name
			Name string `json:"name"`

			// E-mail of person who caused this task, e.g. the person who did
			// `hg push`. The person we should contact to ask why this task is here.
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/metadata/properties/owner
			Owner string `json:"owner"`

			// Link to source of this task, should specify a file, revision and
			// repository. This should be place someone can go an do a git/hg blame
			// to who came up with recipe for this task.
			//
			// Max length: 4096
			//
			// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/metadata/properties/source
			Source string `json:"source"`
		} `json:"metadata"`

		// Task-specific payload following worker-specific format. For example the
		// `docker-worker` requires keys like: `image`, `commands` and
		// `features`. Refer to the documentation of `docker-worker` for details.
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/payload
		Payload json.RawMessage `json:"payload"`

		// Priority of task, this defaults to `normal`. Additional levels may be
		// added later.
		// **Task submitter required scopes** `queue:task-priority:high` for high
		// priority tasks.
		//
		// Possible values:
		//   * "high"
		//   * "normal"
		//
		// Default:    "normal"
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/priority
		Priority string `json:"priority,omitempty"`

		// Unique identifier for a provisioner, that can supply specified
		// `workerType`
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/provisionerId
		ProvisionerID string `json:"provisionerId"`

		// The tasks relation to its dependencies. This property specifies the
		// semantics of the `task.dependencies` property.
		// If `all-completed` is given the task will be scheduled when all
		// dependencies are resolved _completed_ (successful resolution).
		// If `all-resolved` is given the task will be scheduled when all dependencies
		// have been resolved, regardless of what their resolution is.
		//
		// Possible values:
		//   * "all-completed"
		//   * "all-resolved"
		//
		// Default:    "all-completed"
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/requires
		Requires string `json:"requires,omitempty"`

		// Number of times to retry the task in case of infrastructure issues.
		// An _infrastructure issue_ is a worker node that crashes or is shutdown,
		// these events are to be expected.
		//
		// Default:    5
		// Mininum:    0
		// Maximum:    49
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/retries
		Retries int `json:"retries,omitempty"`

		// List of task specific routes, AMQP messages will be CC'ed to these routes.
		// **Task submitter required scopes** `queue:route:<route>` for
		// each route given.
		//
		// Default:    []
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/routes
		Routes []string `json:"routes,omitempty"`

		// Identifier for the scheduler that _defined_ this task, this can be an
		// identifier for a user or a service like the `"task-graph-scheduler"`.
		// **Task submitter required scopes**
		// `queue:assume:scheduler-id:<schedulerId>/<taskGroupId>`.
		// This scope is also necessary to _schedule_ a defined task, or _rerun_ a
		// task.
		//
		// Default:    "-"
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/schedulerId
		SchedulerID string `json:"schedulerId,omitempty"`

		// List of scopes (or scope-patterns) that the task is
		// authorized to use.
		//
		// Default:    []
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/scopes
		Scopes []string `json:"scopes,omitempty"`

		// Arbitrary key-value tags (only strings limited to 4k). These can be used
		// to attach informal meta-data to a task. Use this for informal tags that
		// tasks can be classified by. You can also think of strings here as
		// candidates for formal meta-data. Something like
		// `purpose: 'build' || 'test'` is a good example.
		//
		// Default:    map[]
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/tags
		Tags json.RawMessage `json:"tags,omitempty"`

		// Identifier for a group of tasks scheduled together with this task, by
		// scheduler identified by `schedulerId`. For tasks scheduled by the
		// task-graph scheduler, this is the `taskGraphId`.  Defaults to `taskId` if
		// property isn't specified.
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/taskGroupId
		TaskGroupID string `json:"taskGroupId,omitempty"`

		// Unique identifier for a worker-type within a specific provisioner
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/workerType
		WorkerType string `json:"workerType"`
	}
)

```

Now you can unmarshal your json data into `new(TaskDefinitionRequest)` and you are done!

# Supported URL schemes

Currently we support `http`, `https` and `file` URL schemes. It is recommended
when using `file` scheme, that the URL is of the form
`file://<absolute_path_to_json_schema_file>`.

# Supported schema formats

Currently we support json schema documents in the following formats:

* json
* yaml

# Installation

```
go get github.com/taskcluster/jsonschema2go
```

# Usage

## Using with go generate

To use directly with go generate: include a line like this as a comment in one of your source files:

```go
//go:generate jsonschema2go -u http://schemas.taskcluster.net/queue/v1/create-task-request.json -o main
```

Please note there is no space between `//` and `go:generate`.

The in your build process, include the following steps:

```
go generate
go install
```

## Running as a standalone command

Run with -h to see the full options. Normally you would pipe a list of urls to jsonschema2go, e.g.:

```
$ cat urls.txt | jsonschema2go -o mypackagename
```

## Using from go, as a library

```go
package main

import (
    "io/ioutil"
    "log"

    "github.com/taskcluster/jsonschema2go"
)

func main() {
    job := &jsonschema2go.Job{
        Package: "packageName",
        URLs:    []string{
            "url1",
            "url2",
            "url3",
        },
        ExportTypes: true,
    }
    result, err := job.Execute()
    if err != nil {
        log.Fatalf("Could not generate go types from given json schemas...", err)
    }
    err = ioutil.WriteFile("generatedcode.go", result.SourceCode, 0644)
    if err != nil {
        log.Fatalf("Could not write source code to file system...", err)
    }
}
```

# TODO

- [ ] Properly document all exported types for better go docs
- [ ] Handle `$ref` references that start with `#` character
- [ ] Enforce references point to definitions (if that is a requirement)
- [ ] Support all the JsonSubSchema attributes that have been added but are ignored
- [ ] Test cases
- [ ] Coverage reporting
- [ ] Validate json with json schema, and handle failures gracefully (no panics)
- [ ] Option to create pointer references in generated types rather than values, or a mechanism to have fine control of this
- [ ] Option to no create non-embedded structs, i.e. embedded structs get moved to top level types
- [ ] Create ability to map given types to custom types (e.g. timestamps -> `tcclient.Time`)
- [ ] Remove hard references to `tcclient.Time`
- [ ] Add support for auto-generated validation function(s) that respect the json schema constraints

# Contributing

Contributions welcome, feel free to contact #taskcluster on irc.mozilla.org, or send a pull request.
