// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/queue/v1/api.json

// The queue, typically available at `queue.taskcluster.net`, is responsible
// for accepting tasks and track their state as they are executed by
// workers. In order ensure they are eventually resolved.
//
// This document describes the API end-points offered by the queue. These
// end-points targets the following audience:
//  * Schedulers, who create tasks to be executed,
//  * Workers, who execute tasks, and
//  * Tools, that wants to inspect the state of a task.
//
// See: http://docs.taskcluster.net/queue/api-docs
//
// How to use this package
//
// First create an authentication object:
//
//  Queue := queue.New("myClientId", "myAccessToken")
//
// and then call one or more of auth's methods, e.g.:
//
//  data, callSummary := Queue.Task(.....)
// handling any errors...
//  if callSummary.Error != nil {
//  	// handle error...
//  }
package queue

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
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
	debug = D.Debug("queue")
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
	// Use "https://queue.taskcluster.net/v1" for production.
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
//  Queue := queue.New("123", "456")                       // set clientId and accessToken
//  Queue.Authenticate = false                             // disable authentication (true by default)
//  Queue.BaseURL = "http://localhost:1234/api/Queue/v1"   // alternative API endpoint (production by default)
//  data, callSummary := Queue.Task(.....)                 // for example, call the Task(.....) API endpoint (described further down)...
//  if callSummary.Error != nil {
//  	// handle errors...
//  }
func New(clientId string, accessToken string) *Auth {
	return &Auth{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://queue.taskcluster.net/v1",
		Authenticate: true,
	}
}

// This end-point will return the task-definition. Notice that the task
// definition may have been modified by queue, if an optional property isn't
// specified the queue may provide a default value.
//
// See http://docs.taskcluster.net/queue/api-docs/#task
func (a *Auth) Task(taskId string) (*TaskDefinition1, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/task/"+taskId+"", new(TaskDefinition1))
	return responseObject.(*TaskDefinition1), callSummary
}

// Get task status structure from `taskId`
//
// See http://docs.taskcluster.net/queue/api-docs/#status
func (a *Auth) Status(taskId string) (*TaskStatusResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/task/"+taskId+"/status", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), callSummary
}

// Create a new task, this is an **idempotent** operation, so repeat it if
// you get an internal server error or network connection is dropped.
//
// **Task `deadline´**, the deadline property can be no more than 5 days
// into the future. This is to limit the amount of pending tasks not being
// taken care of. Ideally, you should use a much shorter deadline.
//
// **Task expiration**, the `expires` property must be greater than the
// task `deadline`. If not provided it will default to `deadline` + one
// year. Notice, that artifacts created by task must expire before the task.
//
// **Task specific routing-keys**, using the `task.routes` property you may
// define task specific routing-keys. If a task has a task specific
// routing-key: `<route>`, then the poster will be required to posses the
// scope `queue:route:<route>`. And when the an AMQP message about the task
// is published the message will be CC'ed with the routing-key:
// `route.<route>`. This is useful if you want another component to listen
// for completed tasks you have posted.
//
// See http://docs.taskcluster.net/queue/api-docs/#createTask
func (a *Auth) CreateTask(taskId string, payload *TaskDefinition) (*TaskStatusResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "PUT", "/task/"+taskId+"", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), callSummary
}

// Define a task without scheduling it. This API end-point allows you to
// upload a task definition without having scheduled. The task won't be
// reported as pending until it is scheduled, see the scheduleTask API
// end-point.
//
// The purpose of this API end-point is allow schedulers to upload task
// definitions without the tasks becoming _pending_ immediately. This useful
// if you have a set of dependent tasks. Then you can upload all the tasks
// and when the dependencies of a tasks have been resolved, you can schedule
// the task by calling `/task/:taskId/schedule`. This eliminates the need to
// store tasks somewhere else while waiting for dependencies to resolve.
//
// **Note** this operation is **idempotent**, as long as you upload the same
// task definition as previously defined this operation is safe to retry.
//
// See http://docs.taskcluster.net/queue/api-docs/#defineTask
func (a *Auth) DefineTask(taskId string, payload *TaskDefinition) (*TaskStatusResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "POST", "/task/"+taskId+"/define", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), callSummary
}

// If you have define a task using `defineTask` API end-point, then you
// can schedule the task to be scheduled using this method.
// This will announce the task as pending and workers will be allowed, to
// claim it and resolved the task.
//
// **Note** this operation is **idempotent** and will not fail or complain
// if called with `taskId` that is already scheduled, or even resolved.
// To reschedule a task previously resolved, use `rerunTask`.
//
// See http://docs.taskcluster.net/queue/api-docs/#scheduleTask
func (a *Auth) ScheduleTask(taskId string) (*TaskStatusResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "POST", "/task/"+taskId+"/schedule", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), callSummary
}

// This method _reruns_ a previously resolved task, even if it was
// _completed_. This is useful if your task completes unsuccessfully, and
// you just want to run it from scratch again. This will also reset the
// number of `retries` allowed.
//
// Remember that `retries` in the task status counts the number of runs that
// the queue have started because the worker stopped responding, for example
// because a spot node died.
//
// **Remark** this operation is idempotent, if you try to rerun a task that
// isn't either `failed` or `completed`, this operation will just return the
// current task status.
//
// See http://docs.taskcluster.net/queue/api-docs/#rerunTask
func (a *Auth) RerunTask(taskId string) (*TaskStatusResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "POST", "/task/"+taskId+"/rerun", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), callSummary
}

// This method will cancel a task that is either `unscheduled`, `pending` or
// `running`. It will resolve the current run as `exception` with
// `reasonResolved` set to `canceled`. If the task isn't scheduled yet, ie.
// it doesn't have any runs, an initial run will be added and resolved as
// described above. Hence, after canceling a task, it cannot be scheduled
// with `queue.scheduleTask`, but a new run can be created with
// `queue.rerun`. These semantics is equivalent to calling
// `queue.scheduleTask` immediately followed by `queue.cancelTask`.
//
// **Remark** this operation is idempotent, if you try to cancel a task that
// isn't `unscheduled`, `pending` or `running`, this operation will just
// return the current task status.
//
// See http://docs.taskcluster.net/queue/api-docs/#cancelTask
func (a *Auth) CancelTask(taskId string) (*TaskStatusResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "POST", "/task/"+taskId+"/cancel", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), callSummary
}

// Get a signed URLs to get and delete messages from azure queue.
// Once messages are polled from here, you can claim the referenced task
// with `claimTask`, and afterwards you should always delete the message.
//
// See http://docs.taskcluster.net/queue/api-docs/#pollTaskUrls
func (a *Auth) PollTaskUrls(provisionerId string, workerType string) (*PollTaskUrlsResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/poll-task-url/"+provisionerId+"/"+workerType+"", new(PollTaskUrlsResponse))
	return responseObject.(*PollTaskUrlsResponse), callSummary
}

// claim a task, more to be added later...
//
// See http://docs.taskcluster.net/queue/api-docs/#claimTask
func (a *Auth) ClaimTask(taskId string, runId string, payload *TaskClaimRequest) (*TaskClaimResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "POST", "/task/"+taskId+"/runs/"+runId+"/claim", new(TaskClaimResponse))
	return responseObject.(*TaskClaimResponse), callSummary
}

// reclaim a task more to be added later...
//
// See http://docs.taskcluster.net/queue/api-docs/#reclaimTask
func (a *Auth) ReclaimTask(taskId string, runId string) (*TaskClaimResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "POST", "/task/"+taskId+"/runs/"+runId+"/reclaim", new(TaskClaimResponse))
	return responseObject.(*TaskClaimResponse), callSummary
}

// Report a task completed, resolving the run as `completed`.
//
// See http://docs.taskcluster.net/queue/api-docs/#reportCompleted
func (a *Auth) ReportCompleted(taskId string, runId string) (*TaskStatusResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "POST", "/task/"+taskId+"/runs/"+runId+"/completed", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), callSummary
}

// Report a run failed, resolving the run as `failed`. Use this to resolve
// a run that failed because the task specific code behaved unexpectedly.
// For example the task exited non-zero, or didn't produce expected output.
//
// Don't use this if the task couldn't be run because if malformed payload,
// or other unexpected condition. In these cases we have a task exception,
// which should be reported with `reportException`.
//
// See http://docs.taskcluster.net/queue/api-docs/#reportFailed
func (a *Auth) ReportFailed(taskId string, runId string) (*TaskStatusResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "POST", "/task/"+taskId+"/runs/"+runId+"/failed", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), callSummary
}

// Resolve a run as _exception_. Generally, you will want to report tasks as
// failed instead of exception. But if the payload is malformed, or
// dependencies referenced does not exists you should also report exception.
// However, do not report exception if an external resources is unavailable
// because of network failure, etc. Only if you can validate that the
// resource does not exist.
//
// See http://docs.taskcluster.net/queue/api-docs/#reportException
func (a *Auth) ReportException(taskId string, runId string, payload *TaskExceptionRequest) (*TaskStatusResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "POST", "/task/"+taskId+"/runs/"+runId+"/exception", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), callSummary
}

// This API end-point creates an artifact for a specific run of a task. This
// should **only** be used by a worker currently operating on this task, or
// from a process running within the task (ie. on the worker).
//
// All artifacts must specify when they `expires`, the queue will
// automatically take care of deleting artifacts past their
// expiration point. This features makes it feasible to upload large
// intermediate artifacts from data processing applications, as the
// artifacts can be set to expire a few days later.
//
// We currently support 4 different `storageType`s, each storage type have
// slightly different features and in some cases difference semantics.
//
// **S3 artifacts**, is useful for static files which will be stored on S3.
// When creating an S3 artifact the queue will return a pre-signed URL
// to which you can do a `PUT` request to upload your artifact. Note
// that `PUT` request **must** specify the `content-length` header and
// **must** give the `content-type` header the same value as in the request
// to `createArtifact`.
//
// **Azure artifacts**, are stored in _Azure Blob Storage_ service, which
// given the consistency guarantees and API interface offered by Azure is
// more suitable for artifacts that will be modified during the execution
// of the task. For example docker-worker has a feature that persists the
// task log to Azure Blob Storage every few seconds creating a somewhat
// live log. A request to create an Azure artifact will return a URL
// featuring a [Shared-Access-Signature](http://msdn.microsoft.com/en-us/library/azure/dn140256.aspx),
// refer to MSDN for further information on how to use these.
// **Warning: azure artifact is currently an experimental feature subject
// to changes and data-drops.**
//
// **Reference artifacts**, only consists of meta-data which the queue will
// store for you. These artifacts really only have a `url` property and
// when the artifact is requested the client will be redirect the URL
// provided with a `303` (See Other) redirect. Please note that we cannot
// delete artifacts you upload to other service, we can only delete the
// reference to the artifact, when it expires.
//
// **Error artifacts**, only consists of meta-data which the queue will
// store for you. These artifacts are only meant to indicate that you the
// worker or the task failed to generate a specific artifact, that you
// would otherwise have uploaded. For example docker-worker will upload an
// error artifact, if the file it was supposed to upload doesn't exists or
// turns out to be a directory. Clients requesting an error artifact will
// get a `403` (Forbidden) response. This is mainly designed to ensure that
// dependent tasks can distinguish between artifacts that were suppose to
// be generated and artifacts for which the name is misspelled.
//
// **Artifact immutability**, generally speaking you cannot overwrite an
// artifact when created. But if you repeat the request with the same
// properties the request will succeed as the operation is idempotent.
// This is useful if you need to refresh a signed URL while uploading.
// Do not abuse this to overwrite artifacts created by another entity!
// Such as worker-host overwriting artifact created by worker-code.
//
// As a special case the `url` property on _reference artifacts_ can be
// updated. You should only use this to update the `url` property for
// reference artifacts your process has created.
//
// See http://docs.taskcluster.net/queue/api-docs/#createArtifact
func (a *Auth) CreateArtifact(taskId string, runId string, name string, payload *PostArtifactRequest) (*PostArtifactResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "POST", "/task/"+taskId+"/runs/"+runId+"/artifacts/"+name+"", new(PostArtifactResponse))
	return responseObject.(*PostArtifactResponse), callSummary
}

// Get artifact by `<name>` from a specific run.
//
// **Public Artifacts**, in-order to get an artifact you need the scope
// `queue:get-artifact:<name>`, where `<name>` is the name of the artifact.
// But if the artifact `name` starts with `public/`, authentication and
// authorization is not necessary to fetch the artifact.
//
// **API Clients**, this method will redirect you to the artifact, if it is
// stored externally. Either way, the response may not be JSON. So API
// client users might want to generate a signed URL for this end-point and
// use that URL with a normal HTTP client.
//
// See http://docs.taskcluster.net/queue/api-docs/#getArtifact
func (a *Auth) GetArtifact(taskId string, runId string, name string) *CallSummary {
	_, callSummary := a.apiCall(nil, "GET", "/task/"+taskId+"/runs/"+runId+"/artifacts/"+name+"", nil)
	return callSummary
}

// Get artifact by `<name>` from the last run of a task.
//
// **Public Artifacts**, in-order to get an artifact you need the scope
// `queue:get-artifact:<name>`, where `<name>` is the name of the artifact.
// But if the artifact `name` starts with `public/`, authentication and
// authorization is not necessary to fetch the artifact.
//
// **API Clients**, this method will redirect you to the artifact, if it is
// stored externally. Either way, the response may not be JSON. So API
// client users might want to generate a signed URL for this end-point and
// use that URL with a normal HTTP client.
//
// **Remark**, this end-point is slightly slower than
// `queue.getArtifact`, so consider that if you already know the `runId` of
// the latest run. Otherwise, just us the most convenient API end-point.
//
// See http://docs.taskcluster.net/queue/api-docs/#getLatestArtifact
func (a *Auth) GetLatestArtifact(taskId string, name string) *CallSummary {
	_, callSummary := a.apiCall(nil, "GET", "/task/"+taskId+"/artifacts/"+name+"", nil)
	return callSummary
}

// Returns a list of artifacts and associated meta-data for a given run.
//
// See http://docs.taskcluster.net/queue/api-docs/#listArtifacts
func (a *Auth) ListArtifacts(taskId string, runId string) (*ListArtifactsResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/task/"+taskId+"/runs/"+runId+"/artifacts", new(ListArtifactsResponse))
	return responseObject.(*ListArtifactsResponse), callSummary
}

// Returns a list of artifacts and associated meta-data for the latest run
// from the given task.
//
// See http://docs.taskcluster.net/queue/api-docs/#listLatestArtifacts
func (a *Auth) ListLatestArtifacts(taskId string) (*ListArtifactsResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/task/"+taskId+"/artifacts", new(ListArtifactsResponse))
	return responseObject.(*ListArtifactsResponse), callSummary
}

// Documented later...
// This probably the end-point that will remain after rewriting to azure
// queue storage...
//
// See http://docs.taskcluster.net/queue/api-docs/#pendingTasks
func (a *Auth) PendingTasks(provisionerId string, workerType string) (*CountPendingTasksResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/pending/"+provisionerId+"/"+workerType+"", new(CountPendingTasksResponse))
	return responseObject.(*CountPendingTasksResponse), callSummary
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/queue/api-docs/#ping
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

	// List of artifacts for a given `taskId` and `runId`.
	//
	// See http://schemas.taskcluster.net/queue/v1/list-artifacts-response.json#
	ListArtifactsResponse struct {
		// List of artifacts for given `taskId` and `runId`.
		Artifacts []struct {
			// Mimetype for the artifact that was created.
			ContentType string `json:"contentType"`
			// Date and time after which the artifact created will be automatically
			// deleted by the queue.
			Expires time.Time `json:"expires"`
			// Name of the artifact that was created, this is useful if you want to
			// attempt to fetch the artifact.
			Name string `json:"name"`
			// This is the `storageType` for the request that was used to create
			// the artifact.
			StorageType json.RawMessage `json:"storageType"`
		} `json:"artifacts"`
	}

	// Response to a request for the number of pending tasks for a given
	// `provisionerId` and `workerType`.
	//
	// See http://schemas.taskcluster.net/queue/v1/pending-tasks-response.json#
	CountPendingTasksResponse struct {
		// An approximate number of pending tasks for the given `provisionerId` and
		// `workerType`. This is based on Azure Queue Storage meta-data API, thus,
		// number of reported here may be higher than actual number of pending tasks.
		// But there cannot be more pending tasks reported here. Ie. this is an
		// **upper-bound** on the number of pending tasks.
		PendingTasks int `json:"pendingTasks"`
		// Unique identifier for the provisioner
		ProvisionerId string `json:"provisionerId"`
		// Identifier for worker type within the specified provisioner
		WorkerType string `json:"workerType"`
	}

	// Response to request for poll task urls.
	//
	// See http://schemas.taskcluster.net/queue/v1/poll-task-urls-response.json#
	PollTaskUrlsResponse struct {
		// Date and time after which the signed URLs provided in this response
		// expires and not longer works for authentication.
		Expires time.Time `json:"expires"`
		// List of signed URLs for queues to poll tasks from, they must be called
		// in the order they are given. As the first entry in this array **may**
		// have higher priority.
		Queues []struct {
			// Signed URL to delete messages that have been received using the
			// `signedPollUrl`. You **must** do this to avoid receiving the same
			// message again.
			// To use this URL you must substitute `{{messageId}}` and
			// `{{popReceipt}}` with `MessageId` and `PopReceipt` from the XML
			// response the `signedPollUrl` gave you. Note this URL only works
			// with `DELETE` request.
			SignedDeleteUrl string `json:"signedDeleteUrl"`
			// Signed URL to get message from the Azure Queue Storage queue,
			// that holds messages for the given `provisionerId` and `workerType`.
			// Note that this URL returns XML, see documentation for the Azure
			// Queue Storage
			// [REST API](http://msdn.microsoft.com/en-us/library/azure/dd179474.aspx)
			// for details.
			// When you have a message you can use `claimTask` to claim the task.
			// You will need to parse the XML reponse and base64 decode and
			// JSON parse the `MessageText`.
			// After you have called `claimTask` you **must** us the
			// `signedDeleteUrl` to delete the message.
			// **Remark**, you are allowed to append `&numofmessages=N`,
			// where N < 32, to the URLs if you wish to obtain more than one
			// message at the time.
			SignedPollUrl string `json:"signedPollUrl"`
		} `json:"queues"`
	}

	// Request a authorization to put and artifact or posting of a URL as an artifact. Note that the `storageType` property is referenced in the response as well.
	//
	// See http://schemas.taskcluster.net/queue/v1/post-artifact-request.json#
	PostArtifactRequest json.RawMessage

	// Response to a request for posting an artifact. Note that the `storageType` property is referenced in the request as well.
	//
	// See http://schemas.taskcluster.net/queue/v1/post-artifact-response.json#
	PostArtifactResponse json.RawMessage

	// Request to claim (or reclaim) a task
	//
	// See http://schemas.taskcluster.net/queue/v1/task-claim-request.json#
	TaskClaimRequest struct {
		// Identifier for group that worker claiming the task is a part of.
		WorkerGroup string `json:"workerGroup"`
		// Identifier for worker within the given workerGroup
		WorkerId string `json:"workerId"`
	}

	// Response to a successful task claim
	//
	// See http://schemas.taskcluster.net/queue/v1/task-claim-response.json#
	TaskClaimResponse struct {
		// `run-id` assigned to this run of the task
		RunId  int                 `json:"runId"`
		Status TaskStatusStructure `json:"status"`
		// Time at which the run expires and is resolved as `failed`, if the run isn't reclaimed.
		TakenUntil time.Time `json:"takenUntil"`
		// Identifier for the worker-group within which this run started.
		WorkerGroup string `json:"workerGroup"`
		// Identifier for the worker executing this run.
		WorkerId string `json:"workerId"`
	}

	// Request for a run of a task to be resolved with an exception
	//
	// See http://schemas.taskcluster.net/queue/v1/task-exception-request.json#
	TaskExceptionRequest struct {
		// Reason that the task is resolved with an exception. This is a subset
		// of the values for `resolvedReason` given in the task status structure.
		// Please, report `worker-shutdown` if the run failed because the worker
		// had to shutdown (spot node disappearing).
		// And report `malformed-payload` if the `task.payload` doesn't match the
		// schema for the worker payload, or referenced dependencies doesn't exists.
		// In either case, you should still log the error to a log file under the
		// specific run.
		// In case if `worker-shutdown` the queue will immediately **retry** the
		// task, by making a new run. This is much faster than ignoreing the issue
		// and letting the task _retry_ by claim expiration. For any other _reason_
		// reported the queue will not retry the task.
		Reason json.RawMessage `json:"reason"`
	}

	// Response to a task status request
	//
	// See http://schemas.taskcluster.net/queue/v1/task-status-response.json#
	TaskStatusResponse struct {
		Status TaskStatusStructure `json:"status"`
	}

	// A representation of **task status** as known by the queue
	//
	// See http://schemas.taskcluster.net/queue/v1/task-status.json#
	TaskStatusStructure struct {
		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline. Note, deadline cannot be more than5 days into the future
		Deadline time.Time `json:"deadline"`
		// Task expiration, time at which task definition and status is deleted. Notice that all artifacts for the must have an expiration that is no later than this.
		Expires time.Time `json:"expires"`
		// Unique identifier for the provisioner that this task must be scheduled on
		ProvisionerId string `json:"provisionerId"`
		// Number of retries left for the task in case of infrastructure issues
		RetriesLeft int `json:"retriesLeft"`
		// List of runs, ordered so that index `i` has `runId == i`
		Runs []struct {
			// Reason for the creation of this run,
			// **more reasons may be added in the future**."
			ReasonCreated json.RawMessage `json:"reasonCreated"`
			// Reason that run was resolved, this is mainly
			// useful for runs resolved as `exception`.
			// Note, **more reasons may be added in the future**, also this
			// property is only available after the run is resolved.
			ReasonResolved json.RawMessage `json:"reasonResolved"`
			// Date-time at which this run was resolved, ie. when the run changed
			// state from `running` to either `completed`, `failed` or `exception`.
			// This property is only present after the run as been resolved.
			Resolved time.Time `json:"resolved"`
			// Id of this task run, `run-id`s always starts from `0`
			RunId int `json:"runId"`
			// Date-time at which this run was scheduled, ie. when the run was
			// created in state `pending`.
			Scheduled time.Time `json:"scheduled"`
			// Date-time at which this run was claimed, ie. when the run changed
			// state from `pending` to `running`. This property is only present
			// after the run has been claimed.
			Started time.Time `json:"started"`
			// State of this run
			State json.RawMessage `json:"state"`
			// Time at which the run expires and is resolved as `failed`, if the
			// run isn't reclaimed. Note, only present after the run has been
			// claimed.
			TakenUntil time.Time `json:"takenUntil"`
			// Identifier for group that worker who executes this run is a part of,
			// this identifier is mainly used for efficient routing.
			// Note, this property is only present after the run is claimed.
			WorkerGroup string `json:"workerGroup"`
			// Identifier for worker evaluating this run within given
			// `workerGroup`. Note, this property is only available after the run
			// has been claimed.
			WorkerId string `json:"workerId"`
		} `json:"runs"`
		// Identifier for the scheduler that _defined_ this task.
		SchedulerId string `json:"schedulerId"`
		// State of this task. This is just an auxiliary property derived from state
		// of latests run, or `unscheduled` if none.
		State json.RawMessage `json:"state"`
		// Identifier for a group of tasks scheduled together with this task, by
		// scheduler identified by `schedulerId`. For tasks scheduled by the
		// task-graph scheduler, this is the `taskGraphId`.
		TaskGroupId string `json:"taskGroupId"`
		// Unique task identifier, this is UUID encoded as
		// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
		// stripped of `=` padding.
		TaskId string `json:"taskId"`
		// Identifier for worker type within the specified provisioner
		WorkerType string `json:"workerType"`
	}

	// Definition of a task that can be scheduled
	//
	// See http://schemas.taskcluster.net/queue/v1/task.json#
	TaskDefinition1 struct {
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
)

// MarshalJSON calls json.RawMessage method of the same name. Required since
// PostArtifactRequest is of type json.RawMessage...
func (this *PostArtifactRequest) MarshalJSON() ([]byte, error) {
	x := json.RawMessage(*this)
	return (&x).MarshalJSON()
}

// UnmarshalJSON is a copy of the json.RawMessage implementation.
func (this *PostArtifactRequest) UnmarshalJSON(data []byte) error {
	if this == nil {
		return errors.New("json.RawMessage: UnmarshalJSON on nil pointer")
	}
	*this = append((*this)[0:0], data...)
	return nil
}

// MarshalJSON calls json.RawMessage method of the same name. Required since
// PostArtifactResponse is of type json.RawMessage...
func (this *PostArtifactResponse) MarshalJSON() ([]byte, error) {
	x := json.RawMessage(*this)
	return (&x).MarshalJSON()
}

// UnmarshalJSON is a copy of the json.RawMessage implementation.
func (this *PostArtifactResponse) UnmarshalJSON(data []byte) error {
	if this == nil {
		return errors.New("json.RawMessage: UnmarshalJSON on nil pointer")
	}
	*this = append((*this)[0:0], data...)
	return nil
}
