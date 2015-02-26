// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the client subdirectory:
//
// go generate && go fmt
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
//  data, httpResponse := Queue.CreateTask(.....)
package queue

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
	// Use "https://queue.taskcluster.net/v1" for production.
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
//  Queue := queue.New("123", "456")                       // set clientId and accessToken
//  Queue.Authenticate = false                             // disable authentication (true by default)
//  Queue.BaseURL = "http://localhost:1234/api/Queue/v1"   // alternative API endpoint (production by default)
//  data, httpResponse := Queue.CreateTask(.....)          // for example, call the CreateTask(.....) API endpoint (described further down)...
func New(clientId string, accessToken string) *Auth {
	return &Auth{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://queue.taskcluster.net/v1",
		Authenticate: true}
}

// Create a new task, this is an **idempotent** operation, so repeat it if
// you get an internal server error or network connection is dropped.
//
// **Task `deadline´**, the deadline property can be no more than 7 days
// into the future. This is to limit the amount of pending tasks not being
// taken care of. Ideally, you should use a much shorter deadline.
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
func (a *Auth) CreateTask(taskId string, payload *TaskDefinition) (*TaskStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "PUT", "/task/"+taskId+"", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), httpResponse
}

// Get task definition from queue.
//
// See http://docs.taskcluster.net/queue/api-docs/#getTask
func (a *Auth) GetTask(taskId string) (*TaskDefinition1, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/task/"+taskId+"", new(TaskDefinition1))
	return responseObject.(*TaskDefinition1), httpResponse
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
func (a *Auth) DefineTask(taskId string, payload *TaskDefinition) (*TaskStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/task/"+taskId+"/define", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), httpResponse
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
func (a *Auth) ScheduleTask(taskId string) (*TaskStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "POST", "/task/"+taskId+"/schedule", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), httpResponse
}

// Get task status structure from `taskId`
//
// See http://docs.taskcluster.net/queue/api-docs/#status
func (a *Auth) Status(taskId string) (*TaskStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/task/"+taskId+"/status", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), httpResponse
}

// Get a signed url to get a message from azure queue.
// Once messages are polled from here, you can claim the referenced task
// with `claimTask`.
//
// See http://docs.taskcluster.net/queue/api-docs/#pollTaskUrls
func (a *Auth) PollTaskUrls(provisionerId string, workerType string) (*PollTaskUrlsResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/poll-task-url/"+provisionerId+"/"+workerType+"", new(PollTaskUrlsResponse))
	return responseObject.(*PollTaskUrlsResponse), httpResponse
}

// claim a task, more to be added later...
//
// **Warning,** in the future this API end-point will require the presents
// of `receipt`, `messageId` and `token` in the body.
//
// See http://docs.taskcluster.net/queue/api-docs/#claimTask
func (a *Auth) ClaimTask(taskId string, runId string, payload *TaskClaimRequest) (*TaskClaimResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/task/"+taskId+"/runs/"+runId+"/claim", new(TaskClaimResponse))
	return responseObject.(*TaskClaimResponse), httpResponse
}

// reclaim a task more to be added later...
//
// See http://docs.taskcluster.net/queue/api-docs/#reclaimTask
func (a *Auth) ReclaimTask(taskId string, runId string) (*TaskClaimResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "POST", "/task/"+taskId+"/runs/"+runId+"/reclaim", new(TaskClaimResponse))
	return responseObject.(*TaskClaimResponse), httpResponse
}

// Claim work for a worker, returns information about an appropriate task
// claimed for the worker. Similar to `claimTask`, which can be
// used to claim a specific task, or reclaim a specific task extending the
// `takenUntil` timeout for the run.
//
// **Note**, that if no tasks are _pending_ this method will not assign a
// task to you. Instead it will return `204` and you should wait a while
// before polling the queue again.
//
// **WARNING, this API end-point is deprecated and will be removed**.
//
// See http://docs.taskcluster.net/queue/api-docs/#claimWork
func (a *Auth) ClaimWork(provisionerId string, workerType string, payload *WorkClaimRequest) (*TaskClaimResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/claim-work/"+provisionerId+"/"+workerType+"", new(TaskClaimResponse))
	return responseObject.(*TaskClaimResponse), httpResponse
}

// Report a task completed, resolving the run as `completed`.
//
// For legacy, reasons the `success` parameter is accepted. This will be
// removed in the future.
//
// See http://docs.taskcluster.net/queue/api-docs/#reportCompleted
func (a *Auth) ReportCompleted(taskId string, runId string, payload *TaskCompletedRequest) (*TaskStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/task/"+taskId+"/runs/"+runId+"/completed", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), httpResponse
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
func (a *Auth) ReportFailed(taskId string, runId string) (*TaskStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "POST", "/task/"+taskId+"/runs/"+runId+"/failed", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), httpResponse
}

// Resolve a run as _exception_. Generally, you will want to report tasks as
// failed instead of exception. But if the payload is malformed, or
// dependencies referenced does not exists you should also report exception.
// However, do not report exception if an external resources is unavailable
// because of network failure, etc. Only if you can validate that the
// resource does not exist.
//
// See http://docs.taskcluster.net/queue/api-docs/#reportException
func (a *Auth) ReportException(taskId string, runId string, payload *TaskExceptionRequest) (*TaskStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/task/"+taskId+"/runs/"+runId+"/exception", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), httpResponse
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
func (a *Auth) RerunTask(taskId string) (*TaskStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "POST", "/task/"+taskId+"/rerun", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), httpResponse
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
// When creating an S3 artifact is create the queue will return a pre-signed
// URL to which you can do a `PUT` request to upload your artifact. Note
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
func (a *Auth) CreateArtifact(taskId string, runId string, name string, payload *PostArtifactRequest) (*PostArtifactResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/task/"+taskId+"/runs/"+runId+"/artifacts/"+name+"", new(PostArtifactResponse))
	return responseObject.(*PostArtifactResponse), httpResponse
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
func (a *Auth) GetArtifact(taskId string, runId string, name string) *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/task/"+taskId+"/runs/"+runId+"/artifacts/"+name+"", nil)
	return httpResponse
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
func (a *Auth) GetLatestArtifact(taskId string, name string) *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/task/"+taskId+"/artifacts/"+name+"", nil)
	return httpResponse
}

// Returns a list of artifacts and associated meta-data for a given run.
//
// See http://docs.taskcluster.net/queue/api-docs/#listArtifacts
func (a *Auth) ListArtifacts(taskId string, runId string) (*ListArtifactsResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/task/"+taskId+"/runs/"+runId+"/artifacts", new(ListArtifactsResponse))
	return responseObject.(*ListArtifactsResponse), httpResponse
}

// Returns a list of artifacts and associated meta-data for the latest run
// from the given task.
//
// See http://docs.taskcluster.net/queue/api-docs/#listLatestArtifacts
func (a *Auth) ListLatestArtifacts(taskId string) (*ListArtifactsResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/task/"+taskId+"/artifacts", new(ListArtifactsResponse))
	return responseObject.(*ListArtifactsResponse), httpResponse
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// **This end-point is deprecated!**
//
// See http://docs.taskcluster.net/queue/api-docs/#getPendingTasks
func (a *Auth) GetPendingTasks(provisionerId string) *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/pending-tasks/"+provisionerId+"", nil)
	return httpResponse
}

// Documented later...
//
// **Warning: This is an experimental end-point!**
//
// See http://docs.taskcluster.net/queue/api-docs/#pendingTaskCount
func (a *Auth) PendingTaskCount(provisionerId string) *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/pending/"+provisionerId+"", nil)
	return httpResponse
}

// Documented later...
// This probably the end-point that will remain after rewriting to azure
// queue storage...
//
// **Warning: This is an experimental end-point!**
//
// See http://docs.taskcluster.net/queue/api-docs/#pendingTasks
func (a *Auth) PendingTasks(provisionerId string, workerType string) *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/pending/"+provisionerId+"/"+workerType+"", nil)
	return httpResponse
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/queue/api-docs/#ping
func (a *Auth) Ping() *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/ping", nil)
	return httpResponse
}

type (
	// Request to claim work
	//
	// See http://schemas.taskcluster.net/queue/v1/claim-work-request.json#
	WorkClaimRequest struct {
		// Identifier for group that worker claiming the task is a part of.
		WorkerGroup string `json:"workerGroup"`
		// Identifier for worker within the given workerGroup
		WorkerId string `json:"workerId"`
	}

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
			Expires string `json:"expires"`
			// Name of the artifact that was created, this is useful if you want to
			// attempt to fetch the artifact.
			Name string `json:"name"`
			// This is the `storageType` for the request that was used to create
			// the artifact.
			StorageType interface{} `json:"storageType"`
		} `json:"artifacts"`
	}

	// Response to request for poll task urls.
	//
	// See http://schemas.taskcluster.net/queue/v1/poll-task-urls-response.json#
	PollTaskUrlsResponse struct {
		// Date and time after which the signed URLs provided in this response
		// expires and not longer works for authentication.
		Expires string `json:"expires"`
		// List of signed URLs to poll tasks from, they must be called in the order
		// they are given. As the first entry in this array **may** have higher
		// priority.
		SignedPollTaskUrls []string `json:"signedPollTaskUrls"`
	}

	// Request a authorization to put and artifact or posting of a URL as an artifact. Note that the `storageType` property is referenced in the response as well.
	//
	// See http://schemas.taskcluster.net/queue/v1/post-artifact-request.json#
	PostArtifactRequest interface{}

	// Response to a request for posting an artifact. Note that the `storageType` property is referenced in the request as well.
	//
	// See http://schemas.taskcluster.net/queue/v1/post-artifact-response.json#
	PostArtifactResponse interface{}

	// Request to claim (or reclaim) a task
	//
	// See http://schemas.taskcluster.net/queue/v1/task-claim-request.json#
	TaskClaimRequest struct {
		// MessageId from Azure Queue message
		MessageId string `json:"messageId"`
		// PopReceipt from Azure Queue message
		Receipt string `json:"receipt"`
		// Opaque token from the JSON parsed and base64 decoded MessageText in the Azure Queue message
		Token string `json:"token"`
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
		TakenUntil string `json:"takenUntil"`
		// Identifier for the worker-group within which this run started.
		WorkerGroup string `json:"workerGroup"`
		// Identifier for the worker executing this run.
		WorkerId string `json:"workerId"`
	}

	// Request for a task to be declared completed
	//
	// See http://schemas.taskcluster.net/queue/v1/task-completed-request.json#
	TaskCompletedRequest struct {
		// True, if task is completed, and false if task is failed. This property
		// is optional and only present for backwards compatibility. It will be
		// removed in the future.
		Success bool `json:"success"`
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
		Reason interface{} `json:"reason"`
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
		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline
		Deadline string `json:"deadline"`
		// Unique identifier for the provisioner that this task must be scheduled on
		ProvisionerId string `json:"provisionerId"`
		// Number of retries left for the task in case of infrastructure issues
		RetriesLeft int `json:"retriesLeft"`
		// List of runs, ordered so that index `i` has `runId == i`
		Runs []struct {
			// Reason for the creation of this run,
			// **more reasons may be added in the future**."
			ReasonCreated interface{} `json:"reasonCreated"`
			// Reason that run was resolved, this is mainly
			// useful for runs resolved as `exception`.
			// Note, **more reasons may be added in the future**, also this
			// property is only available after the run is resolved.
			ReasonResolved interface{} `json:"reasonResolved"`
			// Date-time at which this run was resolved, ie. when the run changed
			// state from `running` to either `completed`, `failed` or `exception`.
			// This property is only present after the run as been resolved.
			Resolved string `json:"resolved"`
			// Id of this task run, `run-id`s always starts from `0`
			RunId int `json:"runId"`
			// Date-time at which this run was scheduled, ie. when the run was
			// created in state `pending`.
			Scheduled string `json:"scheduled"`
			// Date-time at which this run was claimed, ie. when the run changed
			// state from `pending` to `running`. This property is only present
			// after the run has been claimed.
			Started string `json:"started"`
			// State of this run
			State interface{} `json:"state"`
			// Time at which the run expires and is resolved as `failed`, if the
			// run isn't reclaimed. Note, only present after the run has been
			// claimed.
			TakenUntil string `json:"takenUntil"`
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
		State interface{} `json:"state"`
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
)
