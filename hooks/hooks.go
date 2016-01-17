// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/hooks/v1/api.json

// Hooks are a mechanism for creating tasks in response to events.
//
// Hooks are identified with a `hookGroupId` and a `hookId`.
//
// When an event occurs, the resulting task is automatically created.  The
// task is created using the scope `assume:hook-id:<hookGroupId>/<hookId>`,
// which must have scopes to make the createTask call, including satisfying all
// scopes in `task.scopes`.
//
// Hooks can have a 'schedule' indicating specific times that new tasks should
// be created.  Each schedule is in a simple cron format, per
// https://www.npmjs.com/package/cron-parser.  For example:
//  * `["0 0 1 * * *"]` -- daily at 1:00 UTC
//  * `["0 0 9,21 * * 1-5", "0 0 12 * * 0,6"]` -- weekdays at 9:00 and 21:00 UTC, weekends at noon
//
// See: http://docs.taskcluster.net/services/hooks
//
// How to use this package
//
// First create a Hooks object:
//
//  myHooks := hooks.New(&tcclient.Credentials{ClientId: "myClientId", AccessToken: "myAccessToken"})
//
// and then call one or more of myHooks's methods, e.g.:
//
//  data, callSummary, err := myHooks.ListHookGroups(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/hooks/v1/api.json together with the input and output schemas it references, downloaded on
// Sun, 17 Jan 2016 at 19:10:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package hooks

import (
	"encoding/json"
	"net/url"

	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

type Hooks tcclient.ConnectionData

// Returns a pointer to Hooks, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false (in which case creds is
// ignored).
//
// For example:
//  creds := &tcclient.Credentials{
//  	ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
//  	AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
//  	Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
//  }
//  myHooks := hooks.New(creds)                              // set credentials
//  myHooks.Authenticate = false                             // disable authentication (creds above are now ignored)
//  myHooks.BaseURL = "http://localhost:1234/api/Hooks/v1"   // alternative API endpoint (production by default)
//  data, callSummary, err := myHooks.ListHookGroups(.....)  // for example, call the ListHookGroups(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Hooks {
	myHooks := Hooks(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://hooks.taskcluster.net/v1",
		Authenticate: true,
	})
	return &myHooks
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will return a list of all hook groups with at least one hook.
//
// See http://docs.taskcluster.net/services/hooks/#listHookGroups
func (myHooks *Hooks) ListHookGroups() (*HookGroups, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/hooks", new(HookGroups), nil)
	return responseObject.(*HookGroups), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will return a list of all the hook definitions within a
// given hook group.
//
// See http://docs.taskcluster.net/services/hooks/#listHooks
func (myHooks *Hooks) ListHooks(hookGroupId string) (*HookList, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId), new(HookList), nil)
	return responseObject.(*HookList), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will return the hook defintion for the given `hookGroupId`
// and hookId.
//
// See http://docs.taskcluster.net/services/hooks/#hook
func (myHooks *Hooks) Hook(hookGroupId, hookId string) (*HookDefinition, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), new(HookDefinition), nil)
	return responseObject.(*HookDefinition), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will return the current status of the hook.  This represents a
// snapshot in time and may vary from one call to the next.
//
// See http://docs.taskcluster.net/services/hooks/#getHookStatus
func (myHooks *Hooks) GetHookStatus(hookGroupId, hookId string) (*HookStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/status", new(HookStatusResponse), nil)
	return responseObject.(*HookStatusResponse), callSummary, err
}

// Stability: *** DEPRECATED ***
//
// This endpoint will return the schedule and next scheduled creation time
// for the given hook.
//
// See http://docs.taskcluster.net/services/hooks/#getHookSchedule
func (myHooks *Hooks) GetHookSchedule(hookGroupId, hookId string) (*HookScheduleResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/schedule", new(HookScheduleResponse), nil)
	return responseObject.(*HookScheduleResponse), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will create a new hook.
//
// The caller's credentials must include the role that will be used to
// create the task.  That role must satisfy task.scopes as well as the
// necessary scopes to add the task to the queue.
//
// Required scopes:
//   * hooks:modify-hook:<hookGroupId>/<hookId>, and
//   * assume:hook-id:<hookGroupId>/<hookId>
//
// See http://docs.taskcluster.net/services/hooks/#createHook
func (myHooks *Hooks) CreateHook(hookGroupId, hookId string, payload *HookCreationRequest) (*HookDefinition, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, callSummary, err := (&cd).APICall(payload, "PUT", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), new(HookDefinition), nil)
	return responseObject.(*HookDefinition), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will update an existing hook.  All fields except
// `hookGroupId` and `hookId` can be modified.
//
// Required scopes:
//   * hooks:modify-hook:<hookGroupId>/<hookId>, and
//   * assume:hook-id:<hookGroupId>/<hookId>
//
// See http://docs.taskcluster.net/services/hooks/#updateHook
func (myHooks *Hooks) UpdateHook(hookGroupId, hookId string, payload *HookCreationRequest) (*HookDefinition, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, callSummary, err := (&cd).APICall(payload, "POST", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), new(HookDefinition), nil)
	return responseObject.(*HookDefinition), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will remove a hook definition.
//
// Required scopes:
//   * hooks:modify-hook:<hookGroupId>/<hookId>
//
// See http://docs.taskcluster.net/services/hooks/#removeHook
func (myHooks *Hooks) RemoveHook(hookGroupId, hookId string) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myHooks)
	_, callSummary, err := (&cd).APICall(nil, "DELETE", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), nil, nil)
	return callSummary, err
}

type (

	// Definition of a hook that can create tasks at defined times.
	//
	// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#
	HookCreationRequest struct {

		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline. Note, deadline cannot be more than5 days into the future.
		//
		// Must be specified as `A years B months C days D hours E minutes F seconds`, though you may leave out zeros. For more details see: `taskcluster.fromNow` in [taskcluster-client](https://github.com/taskcluster/taskcluster-client)
		//
		// Default:    "1 day"
		//
		// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/deadline
		Deadline string `json:"deadline"`

		// Task expiration, time at which task definition and status is deleted. Notice that all artifacts for the must have an expiration that is no later than this.
		//
		// Must be specified as `A years B months C days D hours E minutes F seconds`, though you may leave out zeros. For more details see: `taskcluster.fromNow` in [taskcluster-client](https://github.com/taskcluster/taskcluster-client)
		//
		// Default:    "3 months"
		//
		// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/expires
		Expires string `json:"expires"`

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
			EmailOnError bool `json:"emailOnError"`

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
		Schedule []string `json:"schedule"`

		// See http://schemas.taskcluster.net/hooks/v1/create-hook-request.json#/properties/task
		Task TaskTemplate `json:"task"`
	}

	// Definition of a hook that will create tasks when defined events occur.
	//
	// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#
	HookDefinition struct {

		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline. Note, deadline cannot be more than5 days into the future.
		//
		// Must be specified as `A years B months C days D hours E minutes F seconds`, though you may leave out zeros. For more details see: `taskcluster.fromNow` in [taskcluster-client](https://github.com/taskcluster/taskcluster-client)
		//
		// Default:    "1 day"
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/deadline
		Deadline string `json:"deadline"`

		// Task expiration, time at which task definition and status is deleted. Notice that all artifacts for the must have an expiration that is no later than this.
		//
		// Must be specified as `A years B months C days D hours E minutes F seconds`, though you may leave out zeros. For more details see: `taskcluster.fromNow` in [taskcluster-client](https://github.com/taskcluster/taskcluster-client)
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
		HookGroupId string `json:"hookGroupId"`

		// Max length: 255
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-definition.json#/properties/hookId
		HookId string `json:"hookId"`

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
			EmailOnError bool `json:"emailOnError"`

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
		NextScheduledDate tcclient.Time `json:"nextScheduledDate"`

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
		NextScheduledDate tcclient.Time `json:"nextScheduledDate"`
	}

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
		TaskId string `json:"taskId"`

		// The time the task was created.  This will not necessarily match `task.created`.
		//
		// See http://schemas.taskcluster.net/hooks/v1/hook-status.json#/properties/lastFire/oneOf[0]/properties/time
		Time tcclient.Time `json:"time"`
	}

	// Information about an unsuccesful firing of the hook
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

	// A list of cron-style definitions to represent a set of moments in (UTC) time.
	// If several patterns are specified, a given moment in time represented by
	// more than one pattern is considered only to be counted once, in other words
	// it is allowed for the cron patterns to overlap; duplicates are redundant.
	//
	// Default:    []
	//
	// See http://schemas.taskcluster.net/hooks/v1/schedule.json#
	Schedule []string

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
		// Default:    map[]
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/extra
		Extra json.RawMessage `json:"extra"`

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
		Priority string `json:"priority"`

		// Unique identifier for a provisioner, that can supply specified
		// `workerType`
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/provisionerId
		ProvisionerId string `json:"provisionerId"`

		// Number of times to retry the task in case of infrastructure issues.
		// An _infrastructure issue_ is a worker node that crashes or is shutdown,
		// these events are to be expected.
		//
		// Default:    5
		// Mininum:    0
		// Maximum:    49
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/retries
		Retries int `json:"retries"`

		// List of task specific routes, AMQP messages will be CC'ed to these routes.
		// **Task submitter required scopes** `queue:route:<route>` for
		// each route given.
		//
		// Default:    []
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/routes
		Routes []string `json:"routes"`

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
		SchedulerId string `json:"schedulerId"`

		// List of scopes (or scope-patterns) that the task is
		// authorized to use.
		//
		// Default:    []
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/scopes
		Scopes []string `json:"scopes"`

		// Arbitrary key-value tags (only strings limited to 4k). These can be used
		// to attach informal meta-data to a task. Use this for informal tags that
		// tasks can be classified by. You can also think of strings here as
		// candidates for formal meta-data. Something like
		// `purpose: 'build' || 'test'` is a good example.
		//
		// Default:    map[]
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/tags
		Tags json.RawMessage `json:"tags"`

		// Identifier for a group of tasks scheduled together with this task, by
		// scheduler identified by `schedulerId`. For tasks scheduled by the
		// task-graph scheduler, this is the `taskGraphId`.  Defaults to `taskId` if
		// property isn't specified.
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/taskGroupId
		TaskGroupId string `json:"taskGroupId"`

		// Unique identifier for a worker-type within a specific provisioner
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/hooks/v1/task-template.json#/properties/workerType
		WorkerType string `json:"workerType"`
	}
)
