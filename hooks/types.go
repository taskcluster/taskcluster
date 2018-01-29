// This source code file is AUTO-GENERATED by github.com/taskcluster/jsonschema2go

package hooks

import (
	"encoding/json"
	"errors"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type (
	// Information about an unsuccessful firing of the hook
	//
	// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/lastFire/oneOf[1]
	FailedFire struct {

		// The error that occurred when firing the task.  This is typically,
		// but not always, an API error message.
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/lastFire/oneOf[1]/properties/error
		Error json.RawMessage `json:"error"`

		// Possible values:
		//   * "error"
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/lastFire/oneOf[1]/properties/result
		Result string `json:"result"`

		// The time the task was created.  This will not necessarily match `task.created`.
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/lastFire/oneOf[1]/properties/time
		Time tcclient.Time `json:"time"`
	}

	// Definition of a hook that can create tasks at defined times.
	//
	// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#
	HookCreationRequest struct {

		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline. Note, deadline cannot be more than 5 days into the future. Must be specified as `A years B months C days D hours E minutes F seconds`, though you may leave out zeros. For more details see: `taskcluster.fromNow` in [taskcluster-client](https://github.com/taskcluster/taskcluster-client)
		//
		// Default:    "1 day"
		//
		// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/deadline
		Deadline string `json:"deadline"`

		// Task expiration, time at which task definition and status is deleted. Notice that all artifacts for the must have an expiration that is no later than this. Must be specified as `A years B months C days D hours E minutes F seconds`, though you may leave out zeros. For more details see: `taskcluster.fromNow` in [taskcluster-client](https://github.com/taskcluster/taskcluster-client)
		//
		// Default:    "3 months"
		//
		// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/expires
		Expires string `json:"expires,omitempty"`

		// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/metadata
		Metadata struct {

			// Long-form of the hook's purpose and behavior
			//
			// Max length: 32768
			//
			// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/metadata/properties/description
			Description string `json:"description"`

			// Whether to email the owner on an error creating the task.
			//
			// Default:    true
			//
			// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/metadata/properties/emailOnError
			EmailOnError bool `json:"emailOnError,omitempty"`

			// Human readable name of the hook
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/metadata/properties/name
			Name string `json:"name"`

			// Email of the person or group responsible for this hook.
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/metadata/properties/owner
			Owner string `json:"owner"`
		} `json:"metadata"`

		// Definition of the times at which a hook will result in creation of a task.
		// If several patterns are specified, tasks will be created at any time
		// specified by one or more patterns.
		//
		// Default:    []
		//
		// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/schedule
		Schedule []string `json:"schedule,omitempty"`

		// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/task
		Task TaskTemplate `json:"task"`

		// Default:    {
		//               "additionalProperties": false,
		//               "type": "object"
		//             }
		//
		// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/triggerSchema
		TriggerSchema json.RawMessage `json:"triggerSchema,omitempty"`
	}

	// Definition of a hook that will create tasks when defined events occur.
	//
	// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#
	HookDefinition struct {

		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline. Note, deadline cannot be more than 5 days into the future. Must be specified as `A years B months C days D hours E minutes F seconds`, though you may leave out zeros. For more details see: `taskcluster.fromNow` in [taskcluster-client](https://github.com/taskcluster/taskcluster-client)
		//
		// Default:    "1 day"
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/deadline
		Deadline string `json:"deadline"`

		// Task expiration, time at which task definition and status is deleted. Notice that all artifacts for the must have an expiration that is no later than this. Must be specified as `A years B months C days D hours E minutes F seconds`, though you may leave out zeros. For more details see: `taskcluster.fromNow` in [taskcluster-client](https://github.com/taskcluster/taskcluster-client)
		//
		// Default:    "3 months"
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/expires
		Expires string `json:"expires"`

		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/hookGroupId
		HookGroupID string `json:"hookGroupId"`

		// Max length: 255
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/hookId
		HookID string `json:"hookId"`

		// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/metadata
		Metadata struct {

			// Long-form of the hook's purpose and behavior
			//
			// Max length: 32768
			//
			// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/metadata/properties/description
			Description string `json:"description"`

			// Whether to email the owner on an error creating the task.
			//
			// Default:    true
			//
			// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/metadata/properties/emailOnError
			EmailOnError bool `json:"emailOnError,omitempty"`

			// Human readable name of the hook
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/metadata/properties/name
			Name string `json:"name"`

			// Email of the person or group responsible for this hook.
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/metadata/properties/owner
			Owner string `json:"owner"`
		} `json:"metadata"`

		// Definition of the times at which a hook will result in creation of a task.
		// If several patterns are specified, tasks will be created at any time
		// specified by one or more patterns.  Note that tasks may not be created
		// at exactly the time specified.
		//                     {$ref: "http://schemas.taskcluster.net/hooks/v1/schedule.json"}
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/schedule
		Schedule json.RawMessage `json:"schedule"`

		// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/task
		Task TaskTemplate `json:"task"`

		// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/triggerSchema
		TriggerSchema json.RawMessage `json:"triggerSchema"`
	}

	// List of `hookGroupIds`.
	//
	// See http://schemas.taskcluster.net/hooks/v1/list-hook-groups-response.json#
	HookGroups struct {

		// See http://schemas.taskcluster.net/hooks/v1/list-hook-groups-response.json#/properties/groups
		Groups []string `json:"groups"`
	}

	// List of hooks
	//
	// See http://schemas.taskcluster.net/hooks/v1/list-hooks-response.json#
	HookList struct {

		// See http://schemas.taskcluster.net/hooks/v1/list-hooks-response.json#/properties/hooks
		Hooks []HookDefinition `json:"hooks"`
	}

	// A description of when a hook's task will be created, and the next scheduled time
	//
	// See http://schemas.taskcluster.net/hooks/v1/hook-schedule.json#
	HookScheduleResponse struct {

		// The next time this hook's task is scheduled to be created. This property
		// is only present if there is a scheduled next time. Some hooks don't have
		// any schedules.
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-schedule.json#/properties/nextScheduledDate
		NextScheduledDate tcclient.Time `json:"nextScheduledDate,omitempty"`

		// See http://schemas.taskcluster.net/hooks/v1/hook-schedule.json#/properties/schedule
		Schedule Schedule `json:"schedule"`
	}

	// A snapshot of the current status of a hook.
	//
	// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#
	HookStatusResponse struct {

		// Information about the last time this hook fired.  This property is only present
		// if the hook has fired at least once.
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/lastFire
		LastFire json.RawMessage `json:"lastFire"`

		// The next time this hook's task is scheduled to be created. This property
		// is only present if there is a scheduled next time. Some hooks don't have
		// any schedules.
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/nextScheduledDate
		NextScheduledDate tcclient.Time `json:"nextScheduledDate,omitempty"`
	}

	// Information about no firing of the hook (e.g., a new hook)
	//
	// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/lastFire/oneOf[2]
	NoFire struct {

		// Possible values:
		//   * "no-fire"
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/lastFire/oneOf[2]/properties/result
		Result string `json:"result"`
	}

	// A list of cron-style definitions to represent a set of moments in (UTC) time.
	// If several patterns are specified, a given moment in time represented by
	// more than one pattern is considered only to be counted once, in other words
	// it is allowed for the cron patterns to overlap; duplicates are redundant.
	//
	// Default:    []
	//
	// See http://schemas.taskcluster.net/hooks/v1/schedule.json#
	Schedule []string

	// Information about a successful firing of the hook
	//
	// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/lastFire/oneOf[0]
	SuccessfulFire struct {

		// Possible values:
		//   * "success"
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/lastFire/oneOf[0]/properties/result
		Result string `json:"result"`

		// The task created
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/lastFire/oneOf[0]/properties/taskId
		TaskID string `json:"taskId"`

		// The time the task was created.  This will not necessarily match `task.created`.
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/lastFire/oneOf[0]/properties/time
		Time tcclient.Time `json:"time"`
	}

	// A representation of **task status** as known by the queue
	//
	// See http://schemas.taskcluster.net/hooks/v1/task-status.json#
	TaskStatusStructure struct {

		// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status
		Status struct {

			// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline. Note, deadline cannot be more than 5 days into the future. Must be specified as `A years B months C days D hours E minutes F seconds`, though you may leave out zeros. For more details see: `taskcluster.fromNow` in [taskcluster-client](https://github.com/taskcluster/taskcluster-client)
			//
			// Default:    "1 day"
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/deadline
			Deadline string `json:"deadline"`

			// Task expiration, time at which task definition and status is deleted. Notice that all artifacts for the must have an expiration that is no later than this. Must be specified as `A years B months C days D hours E minutes F seconds`, though you may leave out zeros. For more details see: `taskcluster.fromNow` in [taskcluster-client](https://github.com/taskcluster/taskcluster-client)
			//
			// Default:    "3 months"
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/expires
			Expires string `json:"expires"`

			// Unique identifier for the provisioner that this task must be scheduled on
			//
			// Syntax:     ^([a-zA-Z0-9-_]*)$
			// Min length: 1
			// Max length: 22
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/provisionerId
			ProvisionerID string `json:"provisionerId"`

			// Number of retries left for the task in case of infrastructure issues
			//
			// Mininum:    0
			// Maximum:    999
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/retriesLeft
			RetriesLeft int64 `json:"retriesLeft"`

			// List of runs, ordered so that index `i` has `runId == i`
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/runs
			Runs []struct {

				// Reason for the creation of this run,
				// **more reasons may be added in the future**.
				//
				// Possible values:
				//   * "scheduled"
				//   * "retry"
				//   * "task-retry"
				//   * "rerun"
				//   * "exception"
				//
				// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/runs/items/properties/reasonCreated
				ReasonCreated string `json:"reasonCreated"`

				// Reason that run was resolved, this is mainly
				// useful for runs resolved as `exception`.
				// Note, **more reasons may be added in the future**, also this
				// property is only available after the run is resolved.
				//
				// Possible values:
				//   * "completed"
				//   * "failed"
				//   * "deadline-exceeded"
				//   * "canceled"
				//   * "superseded"
				//   * "claim-expired"
				//   * "worker-shutdown"
				//   * "malformed-payload"
				//   * "resource-unavailable"
				//   * "internal-error"
				//   * "intermittent-task"
				//
				// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/runs/items/properties/reasonResolved
				ReasonResolved string `json:"reasonResolved,omitempty"`

				// Date-time at which this run was resolved, ie. when the run changed
				// state from `running` to either `completed`, `failed` or `exception`.
				// This property is only present after the run as been resolved.
				//
				// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/runs/items/properties/resolved
				Resolved tcclient.Time `json:"resolved,omitempty"`

				// Id of this task run, `run-id`s always starts from `0`
				//
				// Mininum:    0
				// Maximum:    1000
				//
				// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/runs/items/properties/runId
				RunID int64 `json:"runId"`

				// Date-time at which this run was scheduled, ie. when the run was
				// created in state `pending`.
				//
				// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/runs/items/properties/scheduled
				Scheduled tcclient.Time `json:"scheduled"`

				// Date-time at which this run was claimed, ie. when the run changed
				// state from `pending` to `running`. This property is only present
				// after the run has been claimed.
				//
				// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/runs/items/properties/started
				Started tcclient.Time `json:"started,omitempty"`

				// State of this run
				//
				// Possible values:
				//   * "pending"
				//   * "running"
				//   * "completed"
				//   * "failed"
				//   * "exception"
				//
				// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/runs/items/properties/state
				State string `json:"state"`

				// Time at which the run expires and is resolved as `failed`, if the
				// run isn't reclaimed. Note, only present after the run has been
				// claimed.
				//
				// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/runs/items/properties/takenUntil
				TakenUntil tcclient.Time `json:"takenUntil,omitempty"`

				// Identifier for group that worker who executes this run is a part of,
				// this identifier is mainly used for efficient routing.
				// Note, this property is only present after the run is claimed.
				//
				// Syntax:     ^([a-zA-Z0-9-_]*)$
				// Min length: 1
				// Max length: 22
				//
				// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/runs/items/properties/workerGroup
				WorkerGroup string `json:"workerGroup,omitempty"`

				// Identifier for worker evaluating this run within given
				// `workerGroup`. Note, this property is only available after the run
				// has been claimed.
				//
				// Syntax:     ^([a-zA-Z0-9-_]*)$
				// Min length: 1
				// Max length: 22
				//
				// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/runs/items/properties/workerId
				WorkerID string `json:"workerId,omitempty"`
			} `json:"runs"`

			// Identifier for the scheduler that _defined_ this task.
			//
			// Syntax:     ^([a-zA-Z0-9-_]*)$
			// Min length: 1
			// Max length: 22
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/schedulerId
			SchedulerID string `json:"schedulerId"`

			// State of this task. This is just an auxiliary property derived from state
			// of latests run, or `unscheduled` if none.
			//
			// Possible values:
			//   * "unscheduled"
			//   * "pending"
			//   * "running"
			//   * "completed"
			//   * "failed"
			//   * "exception"
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/state
			State string `json:"state"`

			// Identifier for a group of tasks scheduled together with this task, by
			// scheduler identified by `schedulerId`. For tasks scheduled by the
			// task-graph scheduler, this is the `taskGraphId`.
			//
			// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/taskGroupId
			TaskGroupID string `json:"taskGroupId"`

			// Unique task identifier, this is UUID encoded as
			// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
			// stripped of `=` padding.
			//
			// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/taskId
			TaskID string `json:"taskId"`

			// Identifier for worker type within the specified provisioner
			//
			// Syntax:     ^([a-zA-Z0-9-_]*)$
			// Min length: 1
			// Max length: 22
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-status.json#/properties/status/properties/workerType
			WorkerType string `json:"workerType"`
		} `json:"status"`
	}

	// Definition of a task embedded in a hook
	//
	// See http://schemas.taskcluster.net/hooks/v1/task-template.json#
	TaskTemplate struct {

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
		// Default:    {}
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/extra
		Extra json.RawMessage `json:"extra,omitempty"`

		// Required task metadata
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/metadata
		Metadata struct {

			// Human readable description of the task, please **explain** what the
			// task does. A few lines of documentation is not going to hurt you.
			//
			// Max length: 32768
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/metadata/properties/description
			Description string `json:"description"`

			// Human readable name of task, used to very briefly given an idea about
			// what the task does.
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/metadata/properties/name
			Name string `json:"name"`

			// E-mail of person who caused this task, e.g. the person who did
			// `hg push`. The person we should contact to ask why this task is here.
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/metadata/properties/owner
			Owner string `json:"owner"`

			// Link to source of this task, should specify a file, revision and
			// repository. This should be place someone can go an do a git/hg blame
			// to who came up with recipe for this task.
			//
			// Max length: 4096
			//
			// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/metadata/properties/source
			Source string `json:"source"`
		} `json:"metadata"`

		// Task-specific payload following worker-specific format. For example the
		// `docker-worker` requires keys like: `image`, `commands` and
		// `features`. Refer to the documentation of `docker-worker` for details.
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/payload
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
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/priority
		Priority string `json:"priority,omitempty"`

		// Unique identifier for a provisioner, that can supply specified
		// `workerType`
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/provisionerId
		ProvisionerID string `json:"provisionerId"`

		// Number of times to retry the task in case of infrastructure issues.
		// An _infrastructure issue_ is a worker node that crashes or is shutdown,
		// these events are to be expected.
		//
		// Default:    5
		// Mininum:    0
		// Maximum:    49
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/retries
		Retries int64 `json:"retries,omitempty"`

		// List of task specific routes, AMQP messages will be CC'ed to these routes.
		// **Task submitter required scopes** `queue:route:<route>` for
		// each route given.
		//
		// Default:    []
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/routes
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
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/schedulerId
		SchedulerID string `json:"schedulerId,omitempty"`

		// List of scopes (or scope-patterns) that the task is
		// authorized to use.
		//
		// Default:    []
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/scopes
		Scopes []string `json:"scopes,omitempty"`

		// Arbitrary key-value tags (only strings limited to 4k). These can be used
		// to attach informal meta-data to a task. Use this for informal tags that
		// tasks can be classified by. You can also think of strings here as
		// candidates for formal meta-data. Something like
		// `purpose: 'build' || 'test'` is a good example.
		//
		// Default:    {}
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/tags
		Tags json.RawMessage `json:"tags,omitempty"`

		// Identifier for a group of tasks scheduled together with this task, by
		// scheduler identified by `schedulerId`. For tasks scheduled by the
		// task-graph scheduler, this is the `taskGraphId`.  Defaults to `taskId` if
		// property isn't specified.
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/taskGroupId
		TaskGroupID string `json:"taskGroupId,omitempty"`

		// Unique identifier for a worker-type within a specific provisioner
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/workerType
		WorkerType string `json:"workerType"`
	}

	// Trigger context
	//
	// See http://schemas.taskcluster.net/hooks/v1/trigger-context.json#
	TriggerContext json.RawMessage

	// Secret token for a trigger
	//
	// See http://schemas.taskcluster.net/hooks/v1/trigger-token-response.json#
	TriggerTokenResponse struct {

		// See http://schemas.taskcluster.net/hooks/v1/trigger-token-response.json#/properties/token
		Token string `json:"token"`
	}
)

// MarshalJSON calls json.RawMessage method of the same name. Required since
// TriggerContext is of type json.RawMessage...
func (this *TriggerContext) MarshalJSON() ([]byte, error) {
	x := json.RawMessage(*this)
	return (&x).MarshalJSON()
}

// UnmarshalJSON is a copy of the json.RawMessage implementation.
func (this *TriggerContext) UnmarshalJSON(data []byte) error {
	if this == nil {
		return errors.New("TriggerContext: UnmarshalJSON on nil pointer")
	}
	*this = append((*this)[0:0], data...)
	return nil
}
