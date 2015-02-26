// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the client subdirectory:
//
// go generate && go fmt
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
// First create an authentication object:
//
//  auth := auth.New("myClientId", "myAccessToken")
//
// and then call one or more of auth's methods, e.g.:
//
//  data, httpResponse := Scheduler.CreateTaskGraph(.....)
package scheduler

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	hawk "github.com/tent/hawk-go"
	"io"
	"net/http"
	"reflect"
)

func (auth *Auth) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *http.Response) {
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}

	var ioReader io.Reader = nil
	if reflect.ValueOf(payload).IsValid() && !reflect.ValueOf(payload).IsNil() {
		ioReader = bytes.NewReader(jsonPayload)
	}
	httpRequest, err := http.NewRequest(method, auth.BaseURL+route, ioReader)
	if err != nil {
		panic(err)
	}
	// only authenticate if client library user wishes to
	if auth.Authenticate {
		// not sure if we need to regenerate this with each call, will leave in here for now...
		credentials := &hawk.Credentials{
			ID:   auth.ClientId,
			Key:  auth.AccessToken,
			Hash: sha256.New,
		}
		reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0).RequestHeader()
		httpRequest.Header.Set("Authorization", reqAuth)
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	httpClient := &http.Client{}
	// fmt.Println("Request\n=======")
	// fullRequest, err := httputil.DumpRequestOut(httpRequest, true)
	// fmt.Println(string(fullRequest))
	response, err := httpClient.Do(httpRequest)
	// fmt.Println("Response\n========")
	// fullResponse, err := httputil.DumpResponse(response, true)
	// fmt.Println(string(fullResponse))
	if err != nil {
		panic(err)
	}
	defer response.Body.Close()
	// if result is nil, it means there is no response body json
	if reflect.ValueOf(result).IsValid() && !reflect.ValueOf(result).IsNil() {
		json := json.NewDecoder(response.Body)
		err = json.Decode(&result)
		if err != nil {
			panic(err)
		}
	}
	// fmt.Printf("ClientId: %v\nAccessToken: %v\nPayload: %v\nURL: %v\nMethod: %v\nResult: %v\n", auth.ClientId, auth.AccessToken, string(jsonPayload), auth.BaseURL+route, method, result)
	return result, response
}

// The entry point into all the functionality in this package is to create an Auth object.
// It contains your authentication credentials, which are required for all HTTP operations.
type Auth struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
	// The URL of the API endpoint to hit.
	// Use "https://scheduler.taskcluster.net/v1" for production.
	// Please note calling auth.New(clientId string, accessToken string) is an
	// alternative way to create an Auth object with BaseURL set to production.
	BaseURL string
	// Whether authentication is enabled (e.g. set to 'false' when using taskcluster-proxy)
	// Please note calling auth.New(clientId string, accessToken string) is an
	// alternative way to create an Auth object with Authenticate set to true.
	Authenticate bool
}

// Returns a pointer to Auth, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false.
//
// For example:
//  Scheduler := scheduler.New("123", "456")                       // set clientId and accessToken
//  Scheduler.Authenticate = false                                 // disable authentication (true by default)
//  Scheduler.BaseURL = "http://localhost:1234/api/Scheduler/v1"   // alternative API endpoint (production by default)
//  data, httpResponse := Scheduler.CreateTaskGraph(.....)         // for example, call the CreateTaskGraph(.....) API endpoint (described further down)...
func New(clientId string, accessToken string) *Auth {
	return &Auth{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://scheduler.taskcluster.net/v1",
		Authenticate: true}
}

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
// See the queue for details on permissions required. Note, the task-graph
// does not require permissions to schedule the tasks. This is done with
// scopes provided by the task-graph scheduler.
//
// **Task-graph specific routing-keys**, using the `taskGraph.routes`
// property you may define task-graph specific routing-keys. If a task-graph
// has a task-graph specific routing-key: `<route>`, then the poster will
// be required to posses the scope `scheduler:route:<route>`. And when the
// an AMQP message about the task-graph is published the message will be
// CC'ed with the routing-key: `route.<route>`. This is useful if you want
// another component to listen for completed tasks you have posted.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#createTaskGraph
func (a *Auth) CreateTaskGraph(taskGraphId string, payload *TaskGraphDefinition1) (*TaskGraphStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "PUT", "/task-graph/"+taskGraphId+"", new(TaskGraphStatusResponse))
	return responseObject.(*TaskGraphStatusResponse), httpResponse
}

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
// See http://docs.taskcluster.net/scheduler/api-docs/#extendTaskGraph
func (a *Auth) ExtendTaskGraph(taskGraphId string, payload *TaskGraphDefinition) (*TaskGraphStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/task-graph/"+taskGraphId+"/extend", new(TaskGraphStatusResponse))
	return responseObject.(*TaskGraphStatusResponse), httpResponse
}

// Get task-graph status, this will return the _task-graph status
// structure_. which can be used to check if a task-graph is `running`,
// `blocked` or `finished`.
//
// **Note**, that `finished` implies successfully completion.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#status
func (a *Auth) Status(taskGraphId string) (*TaskGraphStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/task-graph/"+taskGraphId+"/status", new(TaskGraphStatusResponse))
	return responseObject.(*TaskGraphStatusResponse), httpResponse
}

// Get task-graph information, this includes the _task-graph status
// structure_, along with `metadata` and `tags`, but not information
// about all tasks.
//
// If you want more detailed information use the `inspectTaskGraph`
// end-point instead.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#info
func (a *Auth) Info(taskGraphId string) (*TaskGraphInfoResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/task-graph/"+taskGraphId+"/info", new(TaskGraphInfoResponse))
	return responseObject.(*TaskGraphInfoResponse), httpResponse
}

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
func (a *Auth) Inspect(taskGraphId string) (*InspectTaskGraphResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/task-graph/"+taskGraphId+"/inspect", new(InspectTaskGraphResponse))
	return responseObject.(*InspectTaskGraphResponse), httpResponse
}

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
func (a *Auth) InspectTask(taskGraphId string, taskId string) (*InspectTaskGraphTaskResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/task-graph/"+taskGraphId+"/inspect/"+taskId+"", new(InspectTaskGraphTaskResponse))
	return responseObject.(*InspectTaskGraphTaskResponse), httpResponse
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#ping
func (a *Auth) Ping() *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/ping", nil)
	return httpResponse
}

type (
	// Definition of a task that can be scheduled
	//
	// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#
	TaskDefinition struct {
		// Creation time of task
		Created string `json:"created"`
		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline
		Deadline string `json:"deadline"`
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

	// Definition of a task-graph that can be scheduled
	//
	// See http://schemas.taskcluster.net/scheduler/v1/extend-task-graph-request.json#
	TaskGraphDefinition struct {
		// List of nodes in the task-graph, each featuring a task definition and scheduling preferences, such as number of _reruns_ to attempt.
		Tasks []struct {
			// List of required `taskId`s
			Requires []string `json:"requires"`
			// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
			Reruns int            `json:"reruns"`
			Task   TaskDefinition `json:"task"`
			// Task identifier (`taskId`) for the task when submitted to the queue, also used in `requires` below. This must be formatted as a **slugid** that is a uuid encoded in url-safe base64 following [RFC 4648 sec. 5](http://tools.ietf.org/html/rfc4648#section-5)), but without `==` padding.
			TaskId string `json:"taskId"`
		} `json:"tasks"`
	}

	// Information about a **task-graph** as known by the scheduler, with all the state of all individual tasks.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json#
	InspectTaskGraphResponse struct {
		// Required task metadata
		Metadata struct {
			// Human readable description of task-graph, **explain** what it does!
			Description string `json:"description"`
			// Human readable name of task-graph
			Name string `json:"name"`
			// E-mail of person who caused this task-graph, e.g. the person who did `hg push`
			Owner string `json:"owner"`
			// Link to source of this task-graph, should specify file, revision and repository
			Source string `json:"source"`
		} `json:"metadata"`
		Status TaskGraphStatusStructure `json:"status"`
		// Arbitrary key-value tags (only strings limited to 4k)
		Tags interface{} `json:"tags"`
		// Mapping from task-labels to task information and state.
		Tasks []struct {
			// List of `taskId`s that requires this task to be _complete successfully_ before they can be scheduled.
			Dependents []string `json:"dependents"`
			// Human readable name from the task definition
			Name string `json:"name"`
			// List of required `taskId`s
			Requires []string `json:"requires"`
			// List of `taskId`s that have yet to complete successfully, before this task can be scheduled.
			RequiresLeft []string `json:"requiresLeft"`
			// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
			Reruns int `json:"reruns"`
			// Number of reruns that haven't been used yet.
			RerunsLeft int `json:"rerunsLeft"`
			// true, if the scheduler considers the task node as satisfied and hence no-longer prevents dependent tasks from running.
			Satisfied bool `json:"satisfied"`
			// State of the task as considered by the scheduler
			State interface{} `json:"state"`
			// Unique task identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
			TaskId string `json:"taskId"`
		} `json:"tasks"`
	}

	// Information about a **task** in a task-graph as known by the scheduler.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json#
	InspectTaskGraphTaskResponse struct {
		// List of `taskId`s that requires this task to be _complete successfully_ before they can be scheduled.
		Dependents []string `json:"dependents"`
		// Human readable name from the task definition
		Name string `json:"name"`
		// List of required `taskId`s
		Requires []string `json:"requires"`
		// List of `taskId`s that have yet to complete successfully, before this task can be scheduled.
		RequiresLeft []string `json:"requiresLeft"`
		// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
		Reruns int `json:"reruns"`
		// Number of reruns that haven't been used yet.
		RerunsLeft int `json:"rerunsLeft"`
		// true, if the scheduler considers the task node as satisfied and hence no-longer prevents dependent tasks from running.
		Satisfied bool `json:"satisfied"`
		// State of the task as considered by the scheduler
		State interface{} `json:"state"`
		// Unique task identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
		TaskId string `json:"taskId"`
	}

	// Response for a request for task-graph information
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-info-response.json#
	TaskGraphInfoResponse struct {
		// Required task metadata
		Metadata struct {
			// Human readable description of task-graph, **explain** what it does!
			Description string `json:"description"`
			// Human readable name of task-graph
			Name string `json:"name"`
			// E-mail of person who caused this task-graph, e.g. the person who did `hg push`
			Owner string `json:"owner"`
			// Link to source of this task-graph, should specify file, revision and repository
			Source string `json:"source"`
		} `json:"metadata"`
		Status TaskGraphStatusStructure `json:"status"`
		// Arbitrary key-value tags (only strings limited to 4k)
		Tags interface{} `json:"tags"`
	}

	// Response containing the status structure for a task-graph
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-status-response.json#
	TaskGraphStatusResponse struct {
		Status TaskGraphStatusStructure `json:"status"`
	}

	// A representation of **task-graph status** as known by the scheduler, without the state of all individual tasks.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-status.json#
	TaskGraphStatusStructure struct {
		// Unique identifier for task-graph scheduler managing the given task-graph
		SchedulerId string `json:"schedulerId"`
		// Task-graph state, this enum is **frozen** new values will **not** be added.
		State interface{} `json:"state"`
		// Unique task-graph identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
		TaskGraphId string `json:"taskGraphId"`
	}

	// Definition of a task-graph that can be scheduled
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph.json#
	TaskGraphDefinition1 struct {
		// Required task metadata"
		Metadata struct {
			// Human readable description of task-graph, **explain** what it does!
			Description string `json:"description"`
			// Human readable name of task-graph, give people finding this an idea
			// what this graph is about.
			Name string `json:"name"`
			// E-mail of person who caused this task-graph, e.g. the person who did
			// `hg push` or whatever triggered it.
			Owner string `json:"owner"`
			// Link to source of this task-graph, should specify file, revision and
			// repository
			Source string `json:"source"`
		} `json:"metadata"`
		// List of task-graph specific routes, AMQP messages will be CC'ed to these
		// routes prefixed by `'route.'`.
		Routes []string `json:"routes"`
		// List of scopes (or scope-patterns) that tasks of the task-graph is
		// authorized to use.
		Scopes []string `json:"scopes"`
		// Arbitrary key-value tags (only strings limited to 4k)
		Tags interface{} `json:"tags"`
		// List of nodes in the task-graph, each featuring a task definition and scheduling preferences, such as number of _reruns_ to attempt.
		Tasks []struct {
			// List of required `taskId`s
			Requires []string `json:"requires"`
			// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
			Reruns int            `json:"reruns"`
			Task   TaskDefinition `json:"task"`
			// Task identifier (`taskId`) for the task when submitted to the queue, also used in `requires` below. This must be formatted as a **slugid** that is a uuid encoded in url-safe base64 following [RFC 4648 sec. 5](http://tools.ietf.org/html/rfc4648#section-5)), but without `==` padding.
			TaskId string `json:"taskId"`
		} `json:"tasks"`
	}
)
