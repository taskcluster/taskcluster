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
//  myHooks := hooks.New("myClientId", "myAccessToken")
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
// Fri, 4 Dec 2015 at 12:57:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package hooks

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"reflect"
	"time"

	"github.com/taskcluster/httpbackoff"
	hawk "github.com/tent/hawk-go"
	D "github.com/tj/go-debug"
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("hooks")
)

// apiCall is the generic REST API calling method which performs all REST API
// calls for this library.  Each auto-generated REST API method simply is a
// wrapper around this method, calling it with specific specific arguments.
func (myHooks *Hooks) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *CallSummary, error) {
	callSummary := new(CallSummary)
	callSummary.HttpRequestObject = payload
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return result, callSummary, err
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
		httpRequest, err := http.NewRequest(method, myHooks.BaseURL+route, ioReader)
		if err != nil {
			return nil, nil, fmt.Errorf("apiCall url cannot be parsed: '%v', is your BaseURL (%v) set correctly?\n%v\n", myHooks.BaseURL+route, myHooks.BaseURL, err)
		}
		httpRequest.Header.Set("Content-Type", "application/json")
		callSummary.HttpRequest = httpRequest
		// Refresh Authorization header with each call...
		// Only authenticate if client library user wishes to.
		if myHooks.Authenticate {
			credentials := &hawk.Credentials{
				ID:   myHooks.ClientId,
				Key:  myHooks.AccessToken,
				Hash: sha256.New,
			}
			reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0)
			if myHooks.Certificate != "" {
				reqAuth.Ext = base64.StdEncoding.EncodeToString([]byte("{\"certificate\":" + myHooks.Certificate + "}"))
			}
			httpRequest.Header.Set("Authorization", reqAuth.RequestHeader())
		}
		debug("Making http request: %v", httpRequest)
		resp, err := httpClient.Do(httpRequest)
		return resp, err, nil
	}

	// Make HTTP API calls using an exponential backoff algorithm...
	callSummary.HttpResponse, callSummary.Attempts, err = httpbackoff.Retry(httpCall)

	if err != nil {
		return result, callSummary, err
	}

	// now read response into memory, so that we can return the body
	var body []byte
	body, err = ioutil.ReadAll(callSummary.HttpResponse.Body)

	if err != nil {
		return result, callSummary, err
	}

	callSummary.HttpResponseBody = string(body)

	// if result is passed in as nil, it means the API defines no response body
	// json
	if reflect.ValueOf(result).IsValid() && !reflect.ValueOf(result).IsNil() {
		err = json.Unmarshal([]byte(callSummary.HttpResponseBody), &result)
	}

	return result, callSummary, err
}

// The entry point into all the functionality in this package is to create a
// Hooks object.  It contains your authentication credentials, which are
// required for all HTTP operations.
type Hooks struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
	// The URL of the API endpoint to hit.
	// Use "https://hooks.taskcluster.net/v1" for production.
	// Please note calling hooks.New(clientId string, accessToken string) is an
	// alternative way to create a Hooks object with BaseURL set to production.
	BaseURL string
	// Whether authentication is enabled (e.g. set to 'false' when using taskcluster-proxy)
	// Please note calling hooks.New(clientId string, accessToken string) is an
	// alternative way to create a Hooks object with Authenticate set to true.
	Authenticate bool
	// Certificate for temporary credentials
	Certificate string
}

// CallSummary provides information about the underlying http request and
// response issued for a given API call.
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
	// Keep a record of how many http requests were attempted
	Attempts int
}

// Returns a pointer to Hooks, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false.
//
// For example:
//  myHooks := hooks.New("123", "456")                       // set clientId and accessToken
//  myHooks.Authenticate = false                             // disable authentication (true by default)
//  myHooks.BaseURL = "http://localhost:1234/api/Hooks/v1"   // alternative API endpoint (production by default)
//  data, callSummary, err := myHooks.ListHookGroups(.....)  // for example, call the ListHookGroups(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(clientId string, accessToken string) *Hooks {
	return &Hooks{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://hooks.taskcluster.net/v1",
		Authenticate: true,
	}
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will return a list of all hook groups with at least one hook.
//
// See http://docs.taskcluster.net/services/hooks/#listHookGroups
func (myHooks *Hooks) ListHookGroups() (*HookGroups, *CallSummary, error) {
	responseObject, callSummary, err := myHooks.apiCall(nil, "GET", "/hooks", new(HookGroups))
	return responseObject.(*HookGroups), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will return a list of all the hook definitions within a
// given hook group.
//
// See http://docs.taskcluster.net/services/hooks/#listHooks
func (myHooks *Hooks) ListHooks(hookGroupId string) (*HookList, *CallSummary, error) {
	responseObject, callSummary, err := myHooks.apiCall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId), new(HookList))
	return responseObject.(*HookList), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will return the hook defintion for the given `hookGroupId`
// and hookId.
//
// See http://docs.taskcluster.net/services/hooks/#hook
func (myHooks *Hooks) Hook(hookGroupId string, hookId string) (*HookDefinition, *CallSummary, error) {
	responseObject, callSummary, err := myHooks.apiCall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), new(HookDefinition))
	return responseObject.(*HookDefinition), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will return the schedule and next scheduled creation time
// for the given hook.
//
// See http://docs.taskcluster.net/services/hooks/#getHookSchedule
func (myHooks *Hooks) GetHookSchedule(hookGroupId string, hookId string) (*HookScheduleResponse, *CallSummary, error) {
	responseObject, callSummary, err := myHooks.apiCall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/schedule", new(HookScheduleResponse))
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
func (myHooks *Hooks) CreateHook(hookGroupId string, hookId string, payload *HookCreationRequest) (*HookDefinition, *CallSummary, error) {
	responseObject, callSummary, err := myHooks.apiCall(payload, "PUT", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), new(HookDefinition))
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
func (myHooks *Hooks) UpdateHook(hookGroupId string, hookId string, payload *HookCreationRequest) (*HookDefinition, *CallSummary, error) {
	responseObject, callSummary, err := myHooks.apiCall(payload, "POST", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), new(HookDefinition))
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
func (myHooks *Hooks) RemoveHook(hookGroupId string, hookId string) (*CallSummary, error) {
	_, callSummary, err := myHooks.apiCall(nil, "DELETE", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), nil)
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
		Task TaskDefinitionRequest `json:"task"`
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

		// Max length: 255
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
		Task TaskDefinitionRequest `json:"task"`
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
		NextScheduledDate Time `json:"nextScheduledDate"`

		// See http://schemas.taskcluster.net/hooks/v1/hook-schedule.json#/properties/schedule
		Schedule Schedule `json:"schedule"`
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

	// Definition of a task that can be scheduled
	//
	// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#
	TaskDefinitionRequest struct {

		// Creation time of task
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/created
		Created Time `json:"created"`

		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline. Note, deadline cannot be more than5 days into the future
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/deadline
		Deadline Time `json:"deadline"`

		// Task expiration, time at which task definition and status is deleted.
		// Notice that all artifacts for the must have an expiration that is no
		// later than this. If this property isn't it will be set to `deadline`
		// plus one year (this default may subject to change).
		//
		// See http://schemas.taskcluster.net/queue/v1/create-task-request.json#/properties/expires
		Expires Time `json:"expires"`

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
)

// Wraps time.Time in order that json serialisation/deserialisation can be adapted.
// Marshaling time.Time types results in RFC3339 dates with nanosecond precision
// in the user's timezone. In order that the json date representation is consistent
// between what we send in json payloads, and what taskcluster services return,
// we wrap time.Time into type hooks.Time which marshals instead
// to the same format used by the TaskCluster services; UTC based, with millisecond
// precision, using 'Z' timezone, e.g. 2015-10-27T20:36:19.255Z.
type Time time.Time

// MarshalJSON implements the json.Marshaler interface.
// The time is a quoted string in RFC 3339 format, with sub-second precision added if present.
func (t Time) MarshalJSON() ([]byte, error) {
	if y := time.Time(t).Year(); y < 0 || y >= 10000 {
		// RFC 3339 is clear that years are 4 digits exactly.
		// See golang.org/issue/4556#c15 for more discussion.
		return nil, errors.New("queue.Time.MarshalJSON: year outside of range [0,9999]")
	}
	return []byte(`"` + t.String() + `"`), nil
}

// UnmarshalJSON implements the json.Unmarshaler interface.
// The time is expected to be a quoted string in RFC 3339 format.
func (t *Time) UnmarshalJSON(data []byte) (err error) {
	// Fractional seconds are handled implicitly by Parse.
	x := new(time.Time)
	*x, err = time.Parse(`"`+time.RFC3339+`"`, string(data))
	*t = Time(*x)
	return
}

// Returns the Time in canonical RFC3339 representation, e.g.
// 2015-10-27T20:36:19.255Z
func (t Time) String() string {
	return time.Time(t).UTC().Format("2006-01-02T15:04:05.000Z")
}
