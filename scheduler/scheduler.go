// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/scheduler/v1/api.json

// The task-graph scheduler, typically available at
// `scheduler.taskcluster.net`, is responsible for accepting task-graphs and
// scheduling tasks for evaluation by the queue as their dependencies are
// satisfied.
//
// This document describes API end-points offered by the task-graph
// scheduler. These end-points targets the following audience:
//  * Post-commit hooks, that wants to submit task-graphs for testing,
//  * End-users, who wants to execute a set of dependent tasks, and
//  * Tools, that wants to inspect the state of a task-graph.
//
// See: http://docs.taskcluster.net/scheduler/api-docs
//
// How to use this package
//
// First create a Scheduler object:
//
//  myScheduler := scheduler.New(&tcclient.Credentials{ClientId: "myClientId", AccessToken: "myAccessToken"})
//
// and then call one or more of myScheduler's methods, e.g.:
//
//  data, callSummary, err := myScheduler.CreateTaskGraph(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/scheduler/v1/api.json together with the input and output schemas it references, downloaded on
// Thu, 7 Jan 2016 at 16:27:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package scheduler

import (
	"encoding/json"
	"net/url"

	"github.com/taskcluster/taskcluster-client-go/tcclient"
	D "github.com/tj/go-debug"
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("scheduler")
)

type Scheduler tcclient.ConnectionData

// Returns a pointer to Scheduler, configured to run against production.  If you
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
//  myScheduler := scheduler.New(creds)                              // set credentials
//  myScheduler.Authenticate = false                                 // disable authentication (creds above are now ignored)
//  myScheduler.BaseURL = "http://localhost:1234/api/Scheduler/v1"   // alternative API endpoint (production by default)
//  data, callSummary, err := myScheduler.CreateTaskGraph(.....)     // for example, call the CreateTaskGraph(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Scheduler {
	myScheduler := Scheduler(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://scheduler.taskcluster.net/v1",
		Authenticate: true,
	})
	return &myScheduler
}

// Stability: *** EXPERIMENTAL ***
//
// Create a new task-graph, the `status` of the resulting JSON is a
// task-graph status structure, you can find the `taskGraphId` in this
// structure.
//
// **Referencing required tasks**, it is possible to reference other tasks
// in the task-graph that must be completed successfully before a task is
// scheduled. You just specify the `taskId` in the list of `required` tasks.
// See the example below, where the second task requires the first task.
// ```js
// {
//   ...
//   tasks: [
//     {
//       taskId:     "XgvL0qtSR92cIWpcwdGKCA",
//       requires:   [],
//       ...
//     },
//     {
//       taskId:     "73GsfK62QNKAk2Hg1EEZTQ",
//       requires:   ["XgvL0qtSR92cIWpcwdGKCA"],
//       task: {
//         payload: {
//           env: {
//             DEPENDS_ON:  "XgvL0qtSR92cIWpcwdGKCA"
//           }
//           ...
//         }
//         ...
//       },
//       ...
//     }
//   ]
// }
// ```
//
// **The `schedulerId` property**, defaults to the `schedulerId` of this
// scheduler in production that is `"task-graph-scheduler"`. This
// property must be either undefined or set to `"task-graph-scheduler"`,
// otherwise the task-graph will be rejected.
//
// **The `taskGroupId` property**, defaults to the `taskGraphId` of the
// task-graph submitted, and if provided much be the `taskGraphId` of
// the task-graph. Otherwise the task-graph will be rejected.
//
// **Task-graph scopes**, a task-graph is assigned a set of scopes, just
// like tasks. Tasks within a task-graph cannot have scopes beyond those
// the task-graph has. The task-graph scheduler will execute all requests
// on behalf of a task-graph using the set of scopes assigned to the
// task-graph. Thus, if you are submitting tasks to `my-worker-type` under
// `my-provisioner` it's important that your task-graph has the scope
// required to define tasks for this `provisionerId` and `workerType`.
// (`queue:define-task:..` or `queue:create-task:..`; see the queue for
// details on scopes required). Note, the task-graph does not require
// permissions to schedule the tasks (`queue:schedule-task:..`), as this is
// done with scopes provided by the task-graph scheduler.
//
// **Task-graph specific routing-keys**, using the `taskGraph.routes`
// property you may define task-graph specific routing-keys. If a task-graph
// has a task-graph specific routing-key: `<route>`, then the poster will
// be required to posses the scope `scheduler:route:<route>`. And when the
// an AMQP message about the task-graph is published the message will be
// CC'ed with the routing-key: `route.<route>`. This is useful if you want
// another component to listen for completed tasks you have posted.
//
// Required scopes:
//   * scheduler:create-task-graph
//
// See http://docs.taskcluster.net/scheduler/api-docs/#createTaskGraph
func (myScheduler *Scheduler) CreateTaskGraph(taskGraphId string, payload *TaskGraphDefinition1) (*TaskGraphStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	responseObject, callSummary, err := (&cd).APICall(payload, "PUT", "/task-graph/"+url.QueryEscape(taskGraphId), new(TaskGraphStatusResponse), nil)
	return responseObject.(*TaskGraphStatusResponse), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Add a set of tasks to an existing task-graph. The request format is very
// similar to the request format for creating task-graphs. But `routes`
// key, `scopes`, `metadata` and `tags` cannot be modified.
//
// **Referencing required tasks**, just as when task-graphs are created,
// each task has a list of required tasks. It is possible to reference
// all `taskId`s within the task-graph.
//
// **Safety,** it is only _safe_ to call this API end-point while the
// task-graph being modified is still running. If the task-graph is
// _finished_ or _blocked_, this method will leave the task-graph in this
// state. Hence, it is only truly _safe_ to call this API end-point from
// within a task in the task-graph being modified.
//
// Required scopes:
//   * scheduler:extend-task-graph:<taskGraphId>
//
// See http://docs.taskcluster.net/scheduler/api-docs/#extendTaskGraph
func (myScheduler *Scheduler) ExtendTaskGraph(taskGraphId string, payload *TaskGraphDefinition) (*TaskGraphStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	responseObject, callSummary, err := (&cd).APICall(payload, "POST", "/task-graph/"+url.QueryEscape(taskGraphId)+"/extend", new(TaskGraphStatusResponse), nil)
	return responseObject.(*TaskGraphStatusResponse), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Get task-graph status, this will return the _task-graph status
// structure_. which can be used to check if a task-graph is `running`,
// `blocked` or `finished`.
//
// **Note**, that `finished` implies successfully completion.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#status
func (myScheduler *Scheduler) Status(taskGraphId string) (*TaskGraphStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/task-graph/"+url.QueryEscape(taskGraphId)+"/status", new(TaskGraphStatusResponse), nil)
	return responseObject.(*TaskGraphStatusResponse), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Get task-graph information, this includes the _task-graph status
// structure_, along with `metadata` and `tags`, but not information
// about all tasks.
//
// If you want more detailed information use the `inspectTaskGraph`
// end-point instead.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#info
func (myScheduler *Scheduler) Info(taskGraphId string) (*TaskGraphInfoResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/task-graph/"+url.QueryEscape(taskGraphId)+"/info", new(TaskGraphInfoResponse), nil)
	return responseObject.(*TaskGraphInfoResponse), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Inspect a task-graph, this returns all the information the task-graph
// scheduler knows about the task-graph and the state of its tasks.
//
// **Warning**, some of these fields are borderline internal to the
// task-graph scheduler and we may choose to change or make them internal
// later. Also note that note all of the information is formalized yet.
// The JSON schema will be updated to reflect formalized values, we think
// it's safe to consider the values stable.
//
// Take these considerations into account when using the API end-point,
// as we do not promise it will remain fully backward compatible in
// the future.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#inspect
func (myScheduler *Scheduler) Inspect(taskGraphId string) (*InspectTaskGraphResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/task-graph/"+url.QueryEscape(taskGraphId)+"/inspect", new(InspectTaskGraphResponse), nil)
	return responseObject.(*InspectTaskGraphResponse), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Inspect a task from a task-graph, this returns all the information the
// task-graph scheduler knows about the specific task.
//
// **Warning**, some of these fields are borderline internal to the
// task-graph scheduler and we may choose to change or make them internal
// later. Also note that note all of the information is formalized yet.
// The JSON schema will be updated to reflect formalized values, we think
// it's safe to consider the values stable.
//
// Take these considerations into account when using the API end-point,
// as we do not promise it will remain fully backward compatible in
// the future.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#inspectTask
func (myScheduler *Scheduler) InspectTask(taskGraphId string, taskId string) (*InspectTaskGraphTaskResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/task-graph/"+url.QueryEscape(taskGraphId)+"/inspect/"+url.QueryEscape(taskId), new(InspectTaskGraphTaskResponse), nil)
	return responseObject.(*InspectTaskGraphTaskResponse), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#ping
func (myScheduler *Scheduler) Ping() (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return callSummary, err
}

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

		// Task expiration, time at which task definition and status is deleted.
		// Notice that all artifacts for the must have an expiration that is no
		// later than this. If this property isn't it will be set to `deadline`
		// plus one year (this default may subject to change).
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/expires
		Expires tcclient.Time `json:"expires"`

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
		Extra json.RawMessage `json:"extra"`

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
		Priority string `json:"priority"`

		// Unique identifier for a provisioner, that can supply specified
		// `workerType`
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/provisionerId
		ProvisionerId string `json:"provisionerId"`

		// Number of times to retry the task in case of infrastructure issues.
		// An _infrastructure issue_ is a worker node that crashes or is shutdown,
		// these events are to be expected.
		//
		// Default:    5
		// Mininum:    0
		// Maximum:    49
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/retries
		Retries int `json:"retries"`

		// List of task specific routes, AMQP messages will be CC'ed to these routes.
		// **Task submitter required scopes** `queue:route:<route>` for
		// each route given.
		//
		// Default:    []
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/routes
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
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/schedulerId
		SchedulerId string `json:"schedulerId"`

		// List of scopes (or scope-patterns) that the task is
		// authorized to use.
		//
		// Default:    []
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/scopes
		Scopes []string `json:"scopes"`

		// Arbitrary key-value tags (only strings limited to 4k). These can be used
		// to attach informal meta-data to a task. Use this for informal tags that
		// tasks can be classified by. You can also think of strings here as
		// candidates for formal meta-data. Something like
		// `purpose: 'build' || 'test'` is a good example.
		//
		// Default:    map[]
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/tags
		Tags json.RawMessage `json:"tags"`

		// Identifier for a group of tasks scheduled together with this task, by
		// scheduler identified by `schedulerId`. For tasks scheduled by the
		// task-graph scheduler, this is the `taskGraphId`.  Defaults to `taskId` if
		// property isn't specified.
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/taskGroupId
		TaskGroupId string `json:"taskGroupId"`

		// Unique identifier for a worker-type within a specific provisioner
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/workerType
		WorkerType string `json:"workerType"`
	}

	// Definition of a task-graph that can be scheduled
	//
	// See http://schemas.taskcluster.net/scheduler/v1/extend-task-graph-request.json#
	TaskGraphDefinition struct {

		// List of nodes in the task-graph, each featuring a task definition and scheduling preferences, such as number of _reruns_ to attempt.
		//
		// See http://schemas.taskcluster.net/scheduler/v1/extend-task-graph-request.json#/properties/tasks
		Tasks []struct {

			// List of required `taskId`s
			//
			// Default:    []
			//
			// See http://schemas.taskcluster.net/scheduler/v1/extend-task-graph-request.json#/properties/tasks/items/properties/requires
			Requires []string `json:"requires"`

			// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
			//
			// Default:    0
			// Mininum:    0
			// Maximum:    100
			//
			// See http://schemas.taskcluster.net/scheduler/v1/extend-task-graph-request.json#/properties/tasks/items/properties/reruns
			Reruns int `json:"reruns"`

			// See http://schemas.taskcluster.net/scheduler/v1/extend-task-graph-request.json#/properties/tasks/items/properties/task
			Task TaskDefinitionRequest `json:"task"`

			// Task identifier (`taskId`) for the task when submitted to the queue, also used in `requires` below. This must be formatted as a **slugid** that is a uuid encoded in url-safe base64 following [RFC 4648 sec. 5](http://tools.ietf.org/html/rfc4648#section-5)), but without `==` padding.
			//
			// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
			//
			// See http://schemas.taskcluster.net/scheduler/v1/extend-task-graph-request.json#/properties/tasks/items/properties/taskId
			TaskId string `json:"taskId"`
		} `json:"tasks"`
	}

	// Information about a **task-graph** as known by the scheduler, with all the state of all individual tasks.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#
	InspectTaskGraphResponse struct {

		// Required task metadata
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/metadata
		Metadata struct {

			// Human readable description of task-graph, **explain** what it does!
			//
			// Max length: 32768
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/metadata/properties/description
			Description string `json:"description"`

			// Human readable name of task-graph
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/metadata/properties/name
			Name string `json:"name"`

			// E-mail of person who caused this task-graph, e.g. the person who did `hg push`
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/metadata/properties/owner
			Owner string `json:"owner"`

			// Link to source of this task-graph, should specify file, revision and repository
			//
			// Max length: 4096
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/metadata/properties/source
			Source string `json:"source"`
		} `json:"metadata"`

		// List of scopes (or scope-patterns) that tasks of the task-graph is authorized to use.
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/scopes
		Scopes []string `json:"scopes"`

		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/status
		Status TaskGraphStatusStructure `json:"status"`

		// Arbitrary key-value tags (only strings limited to 4k)
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/tags
		Tags json.RawMessage `json:"tags"`

		// Mapping from task-labels to task information and state.
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/tasks
		Tasks []struct {

			// List of `taskId`s that requires this task to be _complete successfully_ before they can be scheduled.
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/tasks/items/properties/dependents
			Dependents []string `json:"dependents"`

			// Human readable name from the task definition
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/tasks/items/properties/name
			Name string `json:"name"`

			// List of required `taskId`s
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/tasks/items/properties/requires
			Requires []string `json:"requires"`

			// List of `taskId`s that have yet to complete successfully, before this task can be scheduled.
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/tasks/items/properties/requiresLeft
			RequiresLeft []string `json:"requiresLeft"`

			// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
			//
			// Mininum:    0
			// Maximum:    999
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/tasks/items/properties/reruns
			Reruns int `json:"reruns"`

			// Number of reruns that haven't been used yet.
			//
			// Mininum:    0
			// Maximum:    999
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/tasks/items/properties/rerunsLeft
			RerunsLeft int `json:"rerunsLeft"`

			// true, if the scheduler considers the task node as satisfied and hence no-longer prevents dependent tasks from running.
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/tasks/items/properties/satisfied
			Satisfied bool `json:"satisfied"`

			// State of the task as considered by the scheduler
			//
			// Possible values:
			//   * "unscheduled"
			//   * "scheduled"
			//   * "completed"
			//   * "failed"
			//   * "exception"
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/tasks/items/properties/state
			State string `json:"state"`

			// Unique task identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
			//
			// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
			//
			// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#/properties/tasks/items/properties/taskId
			TaskId string `json:"taskId"`
		} `json:"tasks"`
	}

	// Information about a **task** in a task-graph as known by the scheduler.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json#
	InspectTaskGraphTaskResponse struct {

		// List of `taskId`s that requires this task to be _complete successfully_ before they can be scheduled.
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json#/properties/dependents
		Dependents []string `json:"dependents"`

		// Human readable name from the task definition
		//
		// Max length: 255
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json#/properties/name
		Name string `json:"name"`

		// List of required `taskId`s
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json#/properties/requires
		Requires []string `json:"requires"`

		// List of `taskId`s that have yet to complete successfully, before this task can be scheduled.
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json#/properties/requiresLeft
		RequiresLeft []string `json:"requiresLeft"`

		// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
		//
		// Mininum:    0
		// Maximum:    999
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json#/properties/reruns
		Reruns int `json:"reruns"`

		// Number of reruns that haven't been used yet.
		//
		// Mininum:    0
		// Maximum:    999
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json#/properties/rerunsLeft
		RerunsLeft int `json:"rerunsLeft"`

		// true, if the scheduler considers the task node as satisfied and hence no-longer prevents dependent tasks from running.
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json#/properties/satisfied
		Satisfied bool `json:"satisfied"`

		// State of the task as considered by the scheduler
		//
		// Possible values:
		//   * "unscheduled"
		//   * "scheduled"
		//   * "completed"
		//   * "failed"
		//   * "exception"
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json#/properties/state
		State string `json:"state"`

		// Unique task identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		//
		// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json#/properties/taskId
		TaskId string `json:"taskId"`
	}

	// Response for a request for task-graph information
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-info-response.json#
	TaskGraphInfoResponse struct {

		// Required task metadata
		//
		// See http://schemas.taskcluster.net/scheduler/v1/task-graph-info-response.json#/properties/metadata
		Metadata struct {

			// Human readable description of task-graph, **explain** what it does!
			//
			// Max length: 32768
			//
			// See http://schemas.taskcluster.net/scheduler/v1/task-graph-info-response.json#/properties/metadata/properties/description
			Description string `json:"description"`

			// Human readable name of task-graph
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/scheduler/v1/task-graph-info-response.json#/properties/metadata/properties/name
			Name string `json:"name"`

			// E-mail of person who caused this task-graph, e.g. the person who did `hg push`
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/scheduler/v1/task-graph-info-response.json#/properties/metadata/properties/owner
			Owner string `json:"owner"`

			// Link to source of this task-graph, should specify file, revision and repository
			//
			// Max length: 4096
			//
			// See http://schemas.taskcluster.net/scheduler/v1/task-graph-info-response.json#/properties/metadata/properties/source
			Source string `json:"source"`
		} `json:"metadata"`

		// See http://schemas.taskcluster.net/scheduler/v1/task-graph-info-response.json#/properties/status
		Status TaskGraphStatusStructure `json:"status"`

		// Arbitrary key-value tags (only strings limited to 4k)
		//
		// See http://schemas.taskcluster.net/scheduler/v1/task-graph-info-response.json#/properties/tags
		Tags json.RawMessage `json:"tags"`
	}

	// Response containing the status structure for a task-graph
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-status-response.json#
	TaskGraphStatusResponse struct {

		// See http://schemas.taskcluster.net/scheduler/v1/task-graph-status-response.json#/properties/status
		Status TaskGraphStatusStructure `json:"status"`
	}

	// A representation of **task-graph status** as known by the scheduler, without the state of all individual tasks.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-status.json#
	TaskGraphStatusStructure struct {

		// Unique identifier for task-graph scheduler managing the given task-graph
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/scheduler/v1/task-graph-status.json#/properties/schedulerId
		SchedulerId string `json:"schedulerId"`

		// Task-graph state, this enum is **frozen** new values will **not** be added.
		//
		// Possible values:
		//   * "running"
		//   * "blocked"
		//   * "finished"
		//
		// See http://schemas.taskcluster.net/scheduler/v1/task-graph-status.json#/properties/state
		State string `json:"state"`

		// Unique task-graph identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		//
		// See http://schemas.taskcluster.net/scheduler/v1/task-graph-status.json#/properties/taskGraphId
		TaskGraphId string `json:"taskGraphId"`
	}

	// Definition of a task-graph that can be scheduled
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#
	TaskGraphDefinition1 struct {

		// Required task metadata
		//
		// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/metadata
		Metadata struct {

			// Human readable description of task-graph, **explain** what it does!
			//
			// Max length: 32768
			//
			// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/metadata/properties/description
			Description string `json:"description"`

			// Human readable name of task-graph, give people finding this an idea
			// what this graph is about.
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/metadata/properties/name
			Name string `json:"name"`

			// E-mail of person who caused this task-graph, e.g. the person who did
			// `hg push` or whatever triggered it.
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/metadata/properties/owner
			Owner string `json:"owner"`

			// Link to source of this task-graph, should specify file, revision and
			// repository
			//
			// Max length: 4096
			//
			// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/metadata/properties/source
			Source string `json:"source"`
		} `json:"metadata"`

		// List of task-graph specific routes, AMQP messages will be CC'ed to these
		// routes prefixed by `'route.'`.
		//
		// Default:    []
		//
		// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/routes
		Routes []string `json:"routes"`

		// List of scopes (or scope-patterns) that tasks of the task-graph is
		// authorized to use.
		//
		// Default:    []
		//
		// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/scopes
		Scopes []string `json:"scopes"`

		// Arbitrary key-value tags (only strings limited to 4k)
		//
		// Default:    map[]
		//
		// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/tags
		Tags json.RawMessage `json:"tags"`

		// List of nodes in the task-graph, each featuring a task definition and scheduling preferences, such as number of _reruns_ to attempt.
		//
		// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/tasks
		Tasks []struct {

			// List of required `taskId`s
			//
			// Default:    []
			//
			// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/tasks/items/properties/requires
			Requires []string `json:"requires"`

			// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
			//
			// Default:    0
			// Mininum:    0
			// Maximum:    100
			//
			// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/tasks/items/properties/reruns
			Reruns int `json:"reruns"`

			// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/tasks/items/properties/task
			Task TaskDefinitionRequest `json:"task"`

			// Task identifier (`taskId`) for the task when submitted to the queue, also used in `requires` below. This must be formatted as a **slugid** that is a uuid encoded in url-safe base64 following [RFC 4648 sec. 5](http://tools.ietf.org/html/rfc4648#section-5)), but without `==` padding.
			//
			// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
			//
			// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#/properties/tasks/items/properties/taskId
			TaskId string `json:"taskId"`
		} `json:"tasks"`
	}
)
