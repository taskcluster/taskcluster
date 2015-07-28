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
// First create an authentication object:
//
//  Scheduler := scheduler.New("myClientId", "myAccessToken")
//
// and then call one or more of auth's methods, e.g.:
//
//  data, callSummary := Scheduler.CreateTaskGraph(.....)
// handling any errors...
//  if callSummary.Error != nil {
//  	// handle error...
//  }
package scheduler

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/taskcluster/httpbackoff"
	hawk "github.com/tent/hawk-go"
	D "github.com/tj/go-debug"
	"io"
	"io/ioutil"
	"net/http"
	"reflect"
	"time"
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("scheduler")
)

// apiCall is the generic REST API calling method which performs all REST API
// calls for this library.  Each auto-generated REST API method simply is a
// wrapper around this method, calling it with specific specific arguments.
func (auth *Auth) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *CallSummary) {
	callSummary := new(CallSummary)
	callSummary.HttpRequestObject = payload
	var jsonPayload []byte
	jsonPayload, callSummary.Error = json.Marshal(payload)
	if callSummary.Error != nil {
		return result, callSummary
	}
	callSummary.HttpRequestBody = string(jsonPayload)

	httpClient := &http.Client{}

	// function to perform http request - we call this using backoff library to
	// have exponential backoff in case of intermittent failures (e.g. network
	// blips or HTTP 5xx errors)
	httpCall := func() (*http.Response, error, error) {
		var ioReader io.Reader = nil
		if reflect.ValueOf(payload).IsValid() && !reflect.ValueOf(payload).IsNil() {
			ioReader = bytes.NewReader(jsonPayload)
		}
		httpRequest, err := http.NewRequest(method, auth.BaseURL+route, ioReader)
		if err != nil {
			return nil, nil, fmt.Errorf("apiCall url cannot be parsed: '%v', is your BaseURL (%v) set correctly?\n%v\n", auth.BaseURL+route, auth.BaseURL, err)
		}
		httpRequest.Header.Set("Content-Type", "application/json")
		callSummary.HttpRequest = httpRequest
		// Refresh Authorization header with each call...
		// Only authenticate if client library user wishes to.
		if auth.Authenticate {
			credentials := &hawk.Credentials{
				ID:   auth.ClientId,
				Key:  auth.AccessToken,
				Hash: sha256.New,
			}
			reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0)
			if auth.Certificate != "" {
				reqAuth.Ext = base64.StdEncoding.EncodeToString([]byte("{\"certificate\":" + auth.Certificate + "}"))
			}
			httpRequest.Header.Set("Authorization", reqAuth.RequestHeader())
		}
		debug("Making http request: %v", httpRequest)
		resp, err := httpClient.Do(httpRequest)
		return resp, err, nil
	}

	// Make HTTP API calls using an exponential backoff algorithm...
	callSummary.HttpResponse, callSummary.Attempts, callSummary.Error = httpbackoff.Retry(httpCall)

	if callSummary.Error != nil {
		return result, callSummary
	}

	// now read response into memory, so that we can return the body
	var body []byte
	body, callSummary.Error = ioutil.ReadAll(callSummary.HttpResponse.Body)

	if callSummary.Error != nil {
		return result, callSummary
	}

	callSummary.HttpResponseBody = string(body)

	// if result is passed in as nil, it means the API defines no response body
	// json
	if reflect.ValueOf(result).IsValid() && !reflect.ValueOf(result).IsNil() {
		callSummary.Error = json.Unmarshal([]byte(callSummary.HttpResponseBody), &result)
		if callSummary.Error != nil {
			// technically not needed since returned outside if, but more comprehensible
			return result, callSummary
		}
	}

	// Return result and callSummary
	return result, callSummary
}

// The entry point into all the functionality in this package is to create an
// Auth object.  It contains your authentication credentials, which are
// required for all HTTP operations.
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
	// Certificate for temporary credentials
	Certificate string
}

// CallSummary provides information about the underlying http request and
// response issued for a given API call, together with details of any Error
// which occured. After making an API call, be sure to check the returned
// CallSummary.Error - if it is nil, no error occurred.
type CallSummary struct {
	HttpRequest *http.Request
	// Keep a copy of request body in addition to the *http.Request, since
	// accessing the Body via the *http.Request object, you get a io.ReadCloser
	// - and after the request has been made, the body will have been read, and
	// the data lost... This way, it is still available after the api call
	// returns.
	HttpRequestBody string
	// The Go Type which is marshaled into json and used as the http request
	// body.
	HttpRequestObject interface{}
	HttpResponse      *http.Response
	// Keep a copy of response body in addition to the *http.Response, since
	// accessing the Body via the *http.Response object, you get a
	// io.ReadCloser - and after the response has been read once (to unmarshal
	// json into native go types) the data is lost... This way, it is still
	// available after the api call returns.
	HttpResponseBody string
	Error            error
	// Keep a record of how many http requests were attempted
	Attempts int
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
//  data, callSummary := Scheduler.CreateTaskGraph(.....)          // for example, call the CreateTaskGraph(.....) API endpoint (described further down)...
//  if callSummary.Error != nil {
//  	// handle errors...
//  }
func New(clientId string, accessToken string) *Auth {
	return &Auth{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://scheduler.taskcluster.net/v1",
		Authenticate: true,
	}
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
func (a *Auth) CreateTaskGraph(taskGraphId string, payload *TaskGraphDefinition1) (*TaskGraphStatusResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "PUT", "/task-graph/"+taskGraphId+"", new(TaskGraphStatusResponse))
	return responseObject.(*TaskGraphStatusResponse), callSummary
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
func (a *Auth) ExtendTaskGraph(taskGraphId string, payload *TaskGraphDefinition) (*TaskGraphStatusResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "POST", "/task-graph/"+taskGraphId+"/extend", new(TaskGraphStatusResponse))
	return responseObject.(*TaskGraphStatusResponse), callSummary
}

// Get task-graph status, this will return the _task-graph status
// structure_. which can be used to check if a task-graph is `running`,
// `blocked` or `finished`.
//
// **Note**, that `finished` implies successfully completion.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#status
func (a *Auth) Status(taskGraphId string) (*TaskGraphStatusResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/task-graph/"+taskGraphId+"/status", new(TaskGraphStatusResponse))
	return responseObject.(*TaskGraphStatusResponse), callSummary
}

// Get task-graph information, this includes the _task-graph status
// structure_, along with `metadata` and `tags`, but not information
// about all tasks.
//
// If you want more detailed information use the `inspectTaskGraph`
// end-point instead.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#info
func (a *Auth) Info(taskGraphId string) (*TaskGraphInfoResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/task-graph/"+taskGraphId+"/info", new(TaskGraphInfoResponse))
	return responseObject.(*TaskGraphInfoResponse), callSummary
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
func (a *Auth) Inspect(taskGraphId string) (*InspectTaskGraphResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/task-graph/"+taskGraphId+"/inspect", new(InspectTaskGraphResponse))
	return responseObject.(*InspectTaskGraphResponse), callSummary
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
func (a *Auth) InspectTask(taskGraphId string, taskId string) (*InspectTaskGraphTaskResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/task-graph/"+taskGraphId+"/inspect/"+taskId+"", new(InspectTaskGraphTaskResponse))
	return responseObject.(*InspectTaskGraphTaskResponse), callSummary
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#ping
func (a *Auth) Ping() *CallSummary {
	_, callSummary := a.apiCall(nil, "GET", "/ping", nil)
	return callSummary
}

type (
	// Definition of a task that can be scheduled
	//
	// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#
	TaskDefinition struct {
		// Creation time of task
		Created time.Time `json:"created"`
		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline. Note, deadline cannot be more than5 days into the future
		Deadline time.Time `json:"deadline"`
		// Task expiration, time at which task definition and status is deleted.
		// Notice that all artifacts for the must have an expiration that is no
		// later than this. If this property isn't it will be set to `deadline`
		// plus one year (this default may subject to change).
		Expires time.Time `json:"expires"`
		// Object with properties that can hold any kind of extra data that should be
		// associated with the task. This can be data for the task which doesn't
		// fit into `payload`, or it can supplementary data for use in services
		// listening for events from this task. For example this could be details to
		// display on _treeherder_, or information for indexing the task. Please, try
		// to put all related information under one property, so `extra` data keys
		// for treeherder reporting and task indexing don't conflict, hence, we have
		// reusable services. **Warning**, do not stuff large data-sets in here,
		// task definitions should not take-up multiple MiBs.
		Extra map[string]json.RawMessage `json:"extra"`
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
		Payload map[string]json.RawMessage `json:"payload"`
		// Priority of task, this defaults to `normal` and the scope
		// `queue:task-priority:high` is required to define a task with `priority`
		// set to `high`. Additional priority levels may be added later.
		Priority json.RawMessage `json:"priority"`
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
		Tags map[string]json.RawMessage `json:"tags"`
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
		// List of scopes (or scope-patterns) that tasks of the task-graph is authorized to use.
		Scopes []string                 `json:"scopes"`
		Status TaskGraphStatusStructure `json:"status"`
		// Arbitrary key-value tags (only strings limited to 4k)
		Tags map[string]json.RawMessage `json:"tags"`
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
			State json.RawMessage `json:"state"`
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
		State json.RawMessage `json:"state"`
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
		Tags map[string]json.RawMessage `json:"tags"`
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
		State json.RawMessage `json:"state"`
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
		Tags map[string]json.RawMessage `json:"tags"`
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
