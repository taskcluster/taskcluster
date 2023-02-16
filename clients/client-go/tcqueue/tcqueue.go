// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate

// This package was generated from the schema defined at
// /references/queue/v1/api.json
// The queue service is responsible for accepting tasks and tracking their state
// as they are executed by workers, in order to ensure they are eventually
// resolved.
//
// ## Artifact Storage Types
//
// * **Object artifacts** contain arbitrary data, stored via the object service.
// * **Redirect artifacts**, will redirect the caller to URL when fetched
// with a a 303 (See Other) response.  Clients will not apply any kind of
// authentication to that URL.
// * **Link artifacts**, will be treated as if the caller requested the linked
// artifact on the same task.  Links may be chained, but cycles are forbidden.
// The caller must have scopes for the linked artifact, or a 403 response will
// be returned.
// * **Error artifacts**, only consists of meta-data which the queue will
// store for you. These artifacts are only meant to indicate that you the
// worker or the task failed to generate a specific artifact, that you
// would otherwise have uploaded. For example docker-worker will upload an
// error artifact, if the file it was supposed to upload doesn't exists or
// turns out to be a directory. Clients requesting an error artifact will
// get a `424` (Failed Dependency) response. This is mainly designed to
// ensure that dependent tasks can distinguish between artifacts that were
// suppose to be generated and artifacts for which the name is misspelled.
// * **S3 artifacts** are used for static files which will be
// stored on S3. When creating an S3 artifact the queue will return a
// pre-signed URL to which you can do a `PUT` request to upload your
// artifact. Note that `PUT` request **must** specify the `content-length`
// header and **must** give the `content-type` header the same value as in
// the request to `createArtifact`. S3 artifacts will be deprecated soon,
// and users should prefer object artifacts instead.
//
// ## Artifact immutability
//
// Generally speaking you cannot overwrite an artifact when created.
// But if you repeat the request with the same properties the request will
// succeed as the operation is idempotent.
// This is useful if you need to refresh a signed URL while uploading.
// Do not abuse this to overwrite artifacts created by another entity!
// Such as worker-host overwriting artifact created by worker-code.
//
// The queue defines the following *immutability special cases*:
//
// * A `reference` artifact can replace an existing `reference` artifact.
// * A `link` artifact can replace an existing `reference` artifact.
// * Any artifact's `expires` can be extended (made later, but not earlier).
//
// See:
//
// # How to use this package
//
// First create a Queue object:
//
//	queue := tcqueue.New(nil)
//
// and then call one or more of queue's methods, e.g.:
//
//	err := queue.Ping(.....)
//
// handling any errors...
//
//	if err != nil {
//		// handle error...
//	}
//
// # Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// <rootUrl>/references/queue/v1/api.json together with the input and output schemas it references,
package tcqueue

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v47/clients/client-go"
)

type Queue tcclient.Client

// New returns a Queue client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//	queue := tcqueue.New(
//	    nil,                                      // client without authentication
//	    "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//	)
//	err := queue.Ping(.....)                      // for example, call the Ping(.....) API endpoint (described further down)...
//	if err != nil {
//		// handle errors...
//	}
func New(credentials *tcclient.Credentials, rootURL string) *Queue {
	return &Queue{
		Credentials:  credentials,
		RootURL:      rootURL,
		ServiceName:  "queue",
		APIVersion:   "v1",
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns a *Queue configured from environment variables.
//
// The root URL is taken from TASKCLUSTER_PROXY_URL if set to a non-empty
// string, otherwise from TASKCLUSTER_ROOT_URL if set, otherwise the empty
// string.
//
// The credentials are taken from environment variables:
//
//	TASKCLUSTER_CLIENT_ID
//	TASKCLUSTER_ACCESS_TOKEN
//	TASKCLUSTER_CERTIFICATE
//
// If TASKCLUSTER_CLIENT_ID is empty/unset, authentication will be
// disabled.
func NewFromEnv() *Queue {
	c := tcclient.CredentialsFromEnvVars()
	rootURL := tcclient.RootURLFromEnvVars()
	return &Queue{
		Credentials:  c,
		RootURL:      rootURL,
		ServiceName:  "queue",
		APIVersion:   "v1",
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (queue *Queue) Ping() error {
	cd := tcclient.Client(*queue)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #lbheartbeat
func (queue *Queue) Lbheartbeat() error {
	cd := tcclient.Client(*queue)
	_, _, err := (&cd).APICall(nil, "GET", "/__lbheartbeat__", nil, nil)
	return err
}

// Respond with the JSON version object.
// https://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md
//
// See #version
func (queue *Queue) Version() error {
	cd := tcclient.Client(*queue)
	_, _, err := (&cd).APICall(nil, "GET", "/__version__", nil, nil)
	return err
}

// This end-point will return the task-definition. Notice that the task
// definition may have been modified by queue, if an optional property is
// not specified the queue may provide a default value.
//
// Required scopes:
//
//	queue:get-task:<taskId>
//
// See #task
func (queue *Queue) Task(taskId string) (*TaskDefinitionResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId), new(TaskDefinitionResponse), nil)
	return responseObject.(*TaskDefinitionResponse), err
}

// Returns a signed URL for Task, valid for the specified duration.
//
// Required scopes:
//
//	queue:get-task:<taskId>
//
// See Task for more details.
func (queue *Queue) Task_SignedURL(taskId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId), nil, duration)
}

// Get task status structure from `taskId`
//
// Required scopes:
//
//	queue:status:<taskId>
//
// See #status
func (queue *Queue) Status(taskId string) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/status", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
}

// Returns a signed URL for Status, valid for the specified duration.
//
// Required scopes:
//
//	queue:status:<taskId>
//
// See Status for more details.
func (queue *Queue) Status_SignedURL(taskId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/status", nil, duration)
}

// List tasks sharing the same `taskGroupId`.
//
// As a task-group may contain an unbounded number of tasks, this end-point
// may return a `continuationToken`. To continue listing tasks you must call
// the `listTaskGroup` again with the `continuationToken` as the
// query-string option `continuationToken`.
//
// By default this end-point will try to return up to 1000 members in one
// request. But it **may return less**, even if more tasks are available.
// It may also return a `continuationToken` even though there are no more
// results. However, you can only be sure to have seen all results if you
// keep calling `listTaskGroup` with the last `continuationToken` until you
// get a result without a `continuationToken`.
//
// If you are not interested in listing all the members at once, you may
// use the query-string option `limit` to return fewer.
//
// Required scopes:
//
//	queue:list-task-group:<taskGroupId>
//
// See #listTaskGroup
func (queue *Queue) ListTaskGroup(taskGroupId, continuationToken, limit string) (*ListTaskGroupResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task-group/"+url.QueryEscape(taskGroupId)+"/list", new(ListTaskGroupResponse), v)
	return responseObject.(*ListTaskGroupResponse), err
}

// Returns a signed URL for ListTaskGroup, valid for the specified duration.
//
// Required scopes:
//
//	queue:list-task-group:<taskGroupId>
//
// See ListTaskGroup for more details.
func (queue *Queue) ListTaskGroup_SignedURL(taskGroupId, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task-group/"+url.QueryEscape(taskGroupId)+"/list", v, duration)
}

// Get task group information by `taskGroupId`.
//
// This will return meta-information associated with the task group.
// It contains information about task group expiry date or if it is sealed.
//
// Required scopes:
//
//	queue:list-task-group:<taskGroupId>
//
// See #getTaskGroup
func (queue *Queue) GetTaskGroup(taskGroupId string) (*TaskGroupResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task-group/"+url.QueryEscape(taskGroupId), new(TaskGroupResponse), nil)
	return responseObject.(*TaskGroupResponse), err
}

// Returns a signed URL for GetTaskGroup, valid for the specified duration.
//
// Required scopes:
//
//	queue:list-task-group:<taskGroupId>
//
// See GetTaskGroup for more details.
func (queue *Queue) GetTaskGroup_SignedURL(taskGroupId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task-group/"+url.QueryEscape(taskGroupId), nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// Seal task group to prevent creation of new tasks.
//
// Task group can be sealed once and is irreversible. Calling it multiple times
// will return same result and will not update it again.
//
// Required scopes:
//
//	queue:seal-task-group:<taskGroupId>
//
// See #sealTaskGroup
func (queue *Queue) SealTaskGroup(taskGroupId string) (*TaskGroupResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/task-group/"+url.QueryEscape(taskGroupId)+"/seal", new(TaskGroupResponse), nil)
	return responseObject.(*TaskGroupResponse), err
}

// List tasks that depend on the given `taskId`.
//
// As many tasks from different task-groups may dependent on a single tasks,
// this end-point may return a `continuationToken`. To continue listing
// tasks you must call `listDependentTasks` again with the
// `continuationToken` as the query-string option `continuationToken`.
//
// By default this end-point will try to return up to 1000 tasks in one
// request. But it **may return less**, even if more tasks are available.
// It may also return a `continuationToken` even though there are no more
// results. However, you can only be sure to have seen all results if you
// keep calling `listDependentTasks` with the last `continuationToken` until
// you get a result without a `continuationToken`.
//
// If you are not interested in listing all the tasks at once, you may
// use the query-string option `limit` to return fewer.
//
// Required scopes:
//
//	queue:list-dependent-tasks:<taskId>
//
// See #listDependentTasks
func (queue *Queue) ListDependentTasks(taskId, continuationToken, limit string) (*ListDependentTasksResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/dependents", new(ListDependentTasksResponse), v)
	return responseObject.(*ListDependentTasksResponse), err
}

// Returns a signed URL for ListDependentTasks, valid for the specified duration.
//
// Required scopes:
//
//	queue:list-dependent-tasks:<taskId>
//
// See ListDependentTasks for more details.
func (queue *Queue) ListDependentTasks_SignedURL(taskId, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/dependents", v, duration)
}

// Create a new task, this is an **idempotent** operation, so repeat it if
// you get an internal server error or network connection is dropped.
//
// **Task `deadline`**: the deadline property can be no more than 5 days
// into the future. This is to limit the amount of pending tasks not being
// taken care of. Ideally, you should use a much shorter deadline.
//
// **Task expiration**: the `expires` property must be greater than the
// task `deadline`. If not provided it will default to `deadline` + one
// year. Notice that artifacts created by a task must expire before the
// task's expiration.
//
// **Task specific routing-keys**: using the `task.routes` property you may
// define task specific routing-keys. If a task has a task specific
// routing-key: `<route>`, then when the AMQP message about the task is
// published, the message will be CC'ed with the routing-key:
// `route.<route>`. This is useful if you want another component to listen
// for completed tasks you have posted.  The caller must have scope
// `queue:route:<route>` for each route.
//
// **Dependencies**: any tasks referenced in `task.dependencies` must have
// already been created at the time of this call.
//
// **Scopes**: Note that the scopes required to complete this API call depend
// on the content of the `scopes`, `routes`, `schedulerId`, `priority`,
// `provisionerId`, and `workerType` properties of the task definition.
//
// If the task group was sealed, this end-point will return `409` reporting
// `RequestConflict` to indicate that it is no longer possible to add new tasks
// for this `taskGroupId`.
//
// Required scopes:
//
//	All of:
//	* For scope in scopes each <scope>
//	* For route in routes each queue:route:<route>
//	* queue:create-task:project:<projectId>
//	* queue:scheduler-id:<schedulerId>
//	* For priority in priorities each queue:create-task:<priority>:<provisionerId>/<workerType>
//
// See #createTask
func (queue *Queue) CreateTask(taskId string, payload *TaskDefinitionRequest) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/task/"+url.QueryEscape(taskId), new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
}

// scheduleTask will schedule a task to be executed, even if it has
// unresolved dependencies. A task would otherwise only be scheduled if
// its dependencies were resolved.
//
// This is useful if you have defined a task that depends on itself or on
// some other task that has not been resolved, but you wish the task to be
// scheduled immediately.
//
// This will announce the task as pending and workers will be allowed to
// claim it and resolve the task.
//
// **Note** this operation is **idempotent** and will not fail or complain
// if called with a `taskId` that is already scheduled, or even resolved.
// To reschedule a task previously resolved, use `rerunTask`.
//
// Required scopes:
//
//	Any of:
//	- queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>
//	- queue:schedule-task-in-project:<projectId>
//	- All of:
//	  * queue:schedule-task
//	  * assume:scheduler-id:<schedulerId>/<taskGroupId>
//
// See #scheduleTask
func (queue *Queue) ScheduleTask(taskId string) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/schedule", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
}

// This method _reruns_ a previously resolved task, even if it was
// _completed_. This is useful if your task completes unsuccessfully, and
// you just want to run it from scratch again. This will also reset the
// number of `retries` allowed. It will schedule a task that is _unscheduled_
// regardless of the state of its dependencies.
//
// Remember that `retries` in the task status counts the number of runs that
// the queue have started because the worker stopped responding, for example
// because a spot node died.
//
// **Remark** this operation is idempotent: if it is invoked for a task that
// is `pending` or `running`, it will just return the current task status.
//
// Required scopes:
//
//	Any of:
//	- queue:rerun-task:<schedulerId>/<taskGroupId>/<taskId>
//	- queue:rerun-task-in-project:<projectId>
//	- All of:
//	  * queue:rerun-task
//	  * assume:scheduler-id:<schedulerId>/<taskGroupId>
//
// See #rerunTask
func (queue *Queue) RerunTask(taskId string) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/rerun", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
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
// Required scopes:
//
//	Any of:
//	- queue:cancel-task:<schedulerId>/<taskGroupId>/<taskId>
//	- queue:cancel-task-in-project:<projectId>
//	- All of:
//	  * queue:cancel-task
//	  * assume:scheduler-id:<schedulerId>/<taskGroupId>
//
// See #cancelTask
func (queue *Queue) CancelTask(taskId string) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/cancel", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
}

// Claim pending task(s) for the given task queue.
//
// If any work is available (even if fewer than the requested number of
// tasks, this will return immediately. Otherwise, it will block for tens of
// seconds waiting for work.  If no work appears, it will return an emtpy
// list of tasks.  Callers should sleep a short while (to avoid denial of
// service in an error condition) and call the endpoint again.  This is a
// simple implementation of "long polling".
//
// Required scopes:
//
//	All of:
//	* queue:claim-work:<taskQueueId>
//	* queue:worker-id:<workerGroup>/<workerId>
//
// See #claimWork
func (queue *Queue) ClaimWork(taskQueueId string, payload *ClaimWorkRequest) (*ClaimWorkResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/claim-work/"+url.QueryEscape(taskQueueId), new(ClaimWorkResponse), nil)
	return responseObject.(*ClaimWorkResponse), err
}

// Stability: *** DEPRECATED ***
//
// claim a task - never documented
//
// Required scopes:
//
//	All of:
//	* queue:claim-task:<provisionerId>/<workerType>
//	* queue:worker-id:<workerGroup>/<workerId>
//
// See #claimTask
func (queue *Queue) ClaimTask(taskId, runId string, payload *TaskClaimRequest) (*TaskClaimResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/claim", new(TaskClaimResponse), nil)
	return responseObject.(*TaskClaimResponse), err
}

// Refresh the claim for a specific `runId` for given `taskId`. This updates
// the `takenUntil` property and returns a new set of temporary credentials
// for performing requests on behalf of the task. These credentials should
// be used in-place of the credentials returned by `claimWork`.
//
// The `reclaimTask` requests serves to:
//   - Postpone `takenUntil` preventing the queue from resolving
//     `claim-expired`,
//   - Refresh temporary credentials used for processing the task, and
//   - Abort execution if the task/run have been resolved.
//
// If the `takenUntil` timestamp is exceeded the queue will resolve the run
// as _exception_ with reason `claim-expired`, and proceeded to retry to the
// task. This ensures that tasks are retried, even if workers disappear
// without warning.
//
// If the task is resolved, this end-point will return `409` reporting
// `RequestConflict`. This typically happens if the task have been canceled
// or the `task.deadline` have been exceeded. If reclaiming fails, workers
// should abort the task and forget about the given `runId`. There is no
// need to resolve the run or upload artifacts.
//
// Required scopes:
//
//	queue:reclaim-task:<taskId>/<runId>
//
// See #reclaimTask
func (queue *Queue) ReclaimTask(taskId, runId string) (*TaskReclaimResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/reclaim", new(TaskReclaimResponse), nil)
	return responseObject.(*TaskReclaimResponse), err
}

// Report a task completed, resolving the run as `completed`.
//
// Required scopes:
//
//	queue:resolve-task:<taskId>/<runId>
//
// See #reportCompleted
func (queue *Queue) ReportCompleted(taskId, runId string) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/completed", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
}

// Report a run failed, resolving the run as `failed`. Use this to resolve
// a run that failed because the task specific code behaved unexpectedly.
// For example the task exited non-zero, or didn't produce expected output.
//
// Do not use this if the task couldn't be run because if malformed
// payload, or other unexpected condition. In these cases we have a task
// exception, which should be reported with `reportException`.
//
// Required scopes:
//
//	queue:resolve-task:<taskId>/<runId>
//
// See #reportFailed
func (queue *Queue) ReportFailed(taskId, runId string) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/failed", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
}

// Resolve a run as _exception_. Generally, you will want to report tasks as
// failed instead of exception. You should `reportException` if,
//
//   - The `task.payload` is invalid,
//   - Non-existent resources are referenced,
//   - Declared actions cannot be executed due to unavailable resources,
//   - The worker had to shutdown prematurely,
//   - The worker experienced an unknown error, or,
//   - The task explicitly requested a retry.
//
// Do not use this to signal that some user-specified code crashed for any
// reason specific to this code. If user-specific code hits a resource that
// is temporarily unavailable worker should report task _failed_.
//
// Required scopes:
//
//	queue:resolve-task:<taskId>/<runId>
//
// See #reportException
func (queue *Queue) ReportException(taskId, runId string, payload *TaskExceptionRequest) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/exception", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
}

// This API end-point creates an artifact for a specific run of a task. This
// should **only** be used by a worker currently operating on this task, or
// from a process running within the task (ie. on the worker).
//
// All artifacts must specify when they expire. The queue will
// automatically take care of deleting artifacts past their
// expiration point. This feature makes it feasible to upload large
// intermediate artifacts from data processing applications, as the
// artifacts can be set to expire a few days later.
//
// Required scopes:
//
//	queue:create-artifact:<taskId>/<runId>
//
// See #createArtifact
func (queue *Queue) CreateArtifact(taskId, runId, name string, payload *PostArtifactRequest) (*PostArtifactResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts/"+url.QueryEscape(name), new(PostArtifactResponse), nil)
	return responseObject.(*PostArtifactResponse), err
}

// This endpoint marks an artifact as present for the given task, and
// should be called when the artifact data is fully uploaded.
//
// The storage types `reference`, `link`, and `error` do not need to
// be finished, as they are finished immediately by `createArtifact`.
// The storage type `s3` does not support this functionality and cannot
// be finished.  In all such cases, calling this method is an input error
// (400).
//
// Required scopes:
//
//	queue:create-artifact:<taskId>/<runId>
//
// See #finishArtifact
func (queue *Queue) FinishArtifact(taskId, runId, name string, payload *FinishArtifactRequest) error {
	cd := tcclient.Client(*queue)
	_, _, err := (&cd).APICall(payload, "PUT", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts/"+url.QueryEscape(name), nil, nil)
	return err
}

// Get artifact by `<name>` from a specific run.
//
// **Artifact Access**, in order to get an artifact you need the scope
// `queue:get-artifact:<name>`, where `<name>` is the name of the artifact.
// To allow access to fetch artifacts with a client like `curl` or a web
// browser, without using Taskcluster credentials, include a scope in the
// `anonymous` role.  The convention is to include
// `queue:get-artifact:public/*`.
//
// **Response**: the HTTP response to this method is a 303 redirect to the
// URL from which the artifact can be downloaded.  The body of that response
// contains the data described in the output schema, contianing the same URL.
// Callers are encouraged to use whichever method of gathering the URL is
// most convenient.  Standard HTTP clients will follow the redirect, while
// API client libraries will return the JSON body.
//
// In order to download an artifact the following must be done:
//
// 1. Obtain queue url.  Building a signed url with a taskcluster client is
// recommended
// 1. Make a GET request which does not follow redirects
// 1. In all cases, if specified, the
// x-taskcluster-location-{content,transfer}-{sha256,length} values must be
// validated to be equal to the Content-Length and Sha256 checksum of the
// final artifact downloaded. as well as any intermediate redirects
// 1. If this response is a 500-series error, retry using an exponential
// backoff.  No more than 5 retries should be attempted
// 1. If this response is a 400-series error, treat it appropriately for
// your context.  This might be an error in responding to this request or
// an Error storage type body.  This request should not be retried.
// 1. If this response is a 200-series response, the response body is the artifact.
// If the x-taskcluster-location-{content,transfer}-{sha256,length} and
// x-taskcluster-location-content-encoding are specified, they should match
// this response body
// 1. If the response type is a 300-series redirect, the artifact will be at the
// location specified by the `Location` header.  There are multiple artifact storage
// types which use a 300-series redirect.
// 1. For all redirects followed, the user must verify that the content-sha256, content-length,
// transfer-sha256, transfer-length and content-encoding match every further request.  The final
// artifact must also be validated against the values specified in the original queue response
// 1. Caching of requests with an x-taskcluster-artifact-storage-type value of `reference`
// must not occur
//
// **Headers**
// The following important headers are set on the response to this method:
//
// * location: the url of the artifact if a redirect is to be performed
// * x-taskcluster-artifact-storage-type: the storage type.  Example: s3
//
// Required scopes:
//
//	For name in names each queue:get-artifact:<name>
//
// See #getArtifact
func (queue *Queue) GetArtifact(taskId, runId, name string) (*GetArtifactResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts/"+url.QueryEscape(name), new(GetArtifactResponse), nil)
	return responseObject.(*GetArtifactResponse), err
}

// Returns a signed URL for GetArtifact, valid for the specified duration.
//
// Required scopes:
//
//	For name in names each queue:get-artifact:<name>
//
// See GetArtifact for more details.
func (queue *Queue) GetArtifact_SignedURL(taskId, runId, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts/"+url.QueryEscape(name), nil, duration)
}

// Get artifact by `<name>` from the last run of a task.
//
// **Artifact Access**, in order to get an artifact you need the scope
// `queue:get-artifact:<name>`, where `<name>` is the name of the artifact.
// To allow access to fetch artifacts with a client like `curl` or a web
// browser, without using Taskcluster credentials, include a scope in the
// `anonymous` role.  The convention is to include
// `queue:get-artifact:public/*`.
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
// Required scopes:
//
//	For name in names each queue:get-artifact:<name>
//
// See #getLatestArtifact
func (queue *Queue) GetLatestArtifact(taskId, name string) (*GetArtifactResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/artifacts/"+url.QueryEscape(name), new(GetArtifactResponse), nil)
	return responseObject.(*GetArtifactResponse), err
}

// Returns a signed URL for GetLatestArtifact, valid for the specified duration.
//
// Required scopes:
//
//	For name in names each queue:get-artifact:<name>
//
// See GetLatestArtifact for more details.
func (queue *Queue) GetLatestArtifact_SignedURL(taskId, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/artifacts/"+url.QueryEscape(name), nil, duration)
}

// Returns a list of artifacts and associated meta-data for a given run.
//
// As a task may have many artifacts paging may be necessary. If this
// end-point returns a `continuationToken`, you should call the end-point
// again with the `continuationToken` as the query-string option:
// `continuationToken`.
//
// By default this end-point will list up-to 1000 artifacts in a single page
// you may limit this with the query-string parameter `limit`.
//
// Required scopes:
//
//	queue:list-artifacts:<taskId>:<runId>
//
// See #listArtifacts
func (queue *Queue) ListArtifacts(taskId, runId, continuationToken, limit string) (*ListArtifactsResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts", new(ListArtifactsResponse), v)
	return responseObject.(*ListArtifactsResponse), err
}

// Returns a signed URL for ListArtifacts, valid for the specified duration.
//
// Required scopes:
//
//	queue:list-artifacts:<taskId>:<runId>
//
// See ListArtifacts for more details.
func (queue *Queue) ListArtifacts_SignedURL(taskId, runId, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts", v, duration)
}

// Returns a list of artifacts and associated meta-data for the latest run
// from the given task.
//
// As a task may have many artifacts paging may be necessary. If this
// end-point returns a `continuationToken`, you should call the end-point
// again with the `continuationToken` as the query-string option:
// `continuationToken`.
//
// By default this end-point will list up-to 1000 artifacts in a single page
// you may limit this with the query-string parameter `limit`.
//
// Required scopes:
//
//	queue:list-artifacts:<taskId>
//
// See #listLatestArtifacts
func (queue *Queue) ListLatestArtifacts(taskId, continuationToken, limit string) (*ListArtifactsResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/artifacts", new(ListArtifactsResponse), v)
	return responseObject.(*ListArtifactsResponse), err
}

// Returns a signed URL for ListLatestArtifacts, valid for the specified duration.
//
// Required scopes:
//
//	queue:list-artifacts:<taskId>
//
// See ListLatestArtifacts for more details.
func (queue *Queue) ListLatestArtifacts_SignedURL(taskId, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/artifacts", v, duration)
}

// Returns associated metadata for a given artifact, in the given task run.
// The metadata is the same as that returned from `listArtifacts`, and does
// not grant access to the artifact data.
//
// Note that this method does *not* automatically follow link artifacts.
//
// Required scopes:
//
//	queue:list-artifacts:<taskId>:<runId>
//
// See #artifactInfo
func (queue *Queue) ArtifactInfo(taskId, runId, name string) (*Artifact, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifact-info/"+url.QueryEscape(name), new(Artifact), nil)
	return responseObject.(*Artifact), err
}

// Returns a signed URL for ArtifactInfo, valid for the specified duration.
//
// Required scopes:
//
//	queue:list-artifacts:<taskId>:<runId>
//
// See ArtifactInfo for more details.
func (queue *Queue) ArtifactInfo_SignedURL(taskId, runId, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifact-info/"+url.QueryEscape(name), nil, duration)
}

// Returns associated metadata for a given artifact, in the latest run of the
// task.  The metadata is the same as that returned from `listArtifacts`,
// and does not grant access to the artifact data.
//
// Note that this method does *not* automatically follow link artifacts.
//
// Required scopes:
//
//	queue:list-artifacts:<taskId>
//
// See #latestArtifactInfo
func (queue *Queue) LatestArtifactInfo(taskId, name string) (*Artifact, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/artifact-info/"+url.QueryEscape(name), new(Artifact), nil)
	return responseObject.(*Artifact), err
}

// Returns a signed URL for LatestArtifactInfo, valid for the specified duration.
//
// Required scopes:
//
//	queue:list-artifacts:<taskId>
//
// See LatestArtifactInfo for more details.
func (queue *Queue) LatestArtifactInfo_SignedURL(taskId, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/artifact-info/"+url.QueryEscape(name), nil, duration)
}

// Returns information about the content of the artifact, in the given task run.
//
// Depending on the storage type, the endpoint returns the content of the artifact
// or enough information to access that content.
//
// This method follows link artifacts, so it will not return content
// for a link artifact.
//
// Required scopes:
//
//	For name in names each queue:get-artifact:<name>
//
// See #artifact
func (queue *Queue) Artifact(taskId, runId, name string) (*GetArtifactContentResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifact-content/"+url.QueryEscape(name), new(GetArtifactContentResponse), nil)
	return responseObject.(*GetArtifactContentResponse), err
}

// Returns a signed URL for Artifact, valid for the specified duration.
//
// Required scopes:
//
//	For name in names each queue:get-artifact:<name>
//
// See Artifact for more details.
func (queue *Queue) Artifact_SignedURL(taskId, runId, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifact-content/"+url.QueryEscape(name), nil, duration)
}

// Returns information about the content of the artifact, in the latest task run.
//
// Depending on the storage type, the endpoint returns the content of the artifact
// or enough information to access that content.
//
// This method follows link artifacts, so it will not return content
// for a link artifact.
//
// Required scopes:
//
//	For name in names each queue:get-artifact:<name>
//
// See #latestArtifact
func (queue *Queue) LatestArtifact(taskId, name string) (*GetArtifactContentResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/artifact-content/"+url.QueryEscape(name), new(GetArtifactContentResponse), nil)
	return responseObject.(*GetArtifactContentResponse), err
}

// Returns a signed URL for LatestArtifact, valid for the specified duration.
//
// Required scopes:
//
//	For name in names each queue:get-artifact:<name>
//
// See LatestArtifact for more details.
func (queue *Queue) LatestArtifact_SignedURL(taskId, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/artifact-content/"+url.QueryEscape(name), nil, duration)
}

// Stability: *** DEPRECATED ***
//
// Get all active provisioners.
//
// The term "provisioner" is taken broadly to mean anything with a provisionerId.
// This does not necessarily mean there is an associated service performing any
// provisioning activity.
//
// The response is paged. If this end-point returns a `continuationToken`, you
// should call the end-point again with the `continuationToken` as a query-string
// option. By default this end-point will list up to 1000 provisioners in a single
// page. You may limit this with the query-string parameter `limit`.
//
// Required scopes:
//
//	queue:list-provisioners
//
// See #listProvisioners
func (queue *Queue) ListProvisioners(continuationToken, limit string) (*ListProvisionersResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/provisioners", new(ListProvisionersResponse), v)
	return responseObject.(*ListProvisionersResponse), err
}

// Returns a signed URL for ListProvisioners, valid for the specified duration.
//
// Required scopes:
//
//	queue:list-provisioners
//
// See ListProvisioners for more details.
func (queue *Queue) ListProvisioners_SignedURL(continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/provisioners", v, duration)
}

// Stability: *** DEPRECATED ***
//
// Get an active provisioner.
//
// The term "provisioner" is taken broadly to mean anything with a provisionerId.
// This does not necessarily mean there is an associated service performing any
// provisioning activity.
//
// Required scopes:
//
//	queue:get-provisioner:<provisionerId>
//
// See #getProvisioner
func (queue *Queue) GetProvisioner(provisionerId string) (*ProvisionerResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/provisioners/"+url.QueryEscape(provisionerId), new(ProvisionerResponse), nil)
	return responseObject.(*ProvisionerResponse), err
}

// Returns a signed URL for GetProvisioner, valid for the specified duration.
//
// Required scopes:
//
//	queue:get-provisioner:<provisionerId>
//
// See GetProvisioner for more details.
func (queue *Queue) GetProvisioner_SignedURL(provisionerId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/provisioners/"+url.QueryEscape(provisionerId), nil, duration)
}

// Stability: *** DEPRECATED ***
//
// Declare a provisioner, supplying some details about it.
//
// `declareProvisioner` allows updating one or more properties of a provisioner as long as the required scopes are
// possessed. For example, a request to update the `my-provisioner`
// provisioner with a body `{description: 'This provisioner is great'}` would require you to have the scope
// `queue:declare-provisioner:my-provisioner#description`.
//
// The term "provisioner" is taken broadly to mean anything with a provisionerId.
// This does not necessarily mean there is an associated service performing any
// provisioning activity.
//
// Required scopes:
//
//	For property in properties each queue:declare-provisioner:<provisionerId>#<property>
//
// See #declareProvisioner
func (queue *Queue) DeclareProvisioner(provisionerId string, payload *ProvisionerRequest) (*ProvisionerResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/provisioners/"+url.QueryEscape(provisionerId), new(ProvisionerResponse), nil)
	return responseObject.(*ProvisionerResponse), err
}

// Get an approximate number of pending tasks for the given `taskQueueId`.
//
// The underlying Azure Storage Queues only promises to give us an estimate.
// Furthermore, we cache the result in memory for 20 seconds. So consumers
// should be no means expect this to be an accurate number.
// It is, however, a solid estimate of the number of pending tasks.
//
// Required scopes:
//
//	queue:pending-count:<taskQueueId>
//
// See #pendingTasks
func (queue *Queue) PendingTasks(taskQueueId string) (*CountPendingTasksResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/pending/"+url.QueryEscape(taskQueueId), new(CountPendingTasksResponse), nil)
	return responseObject.(*CountPendingTasksResponse), err
}

// Returns a signed URL for PendingTasks, valid for the specified duration.
//
// Required scopes:
//
//	queue:pending-count:<taskQueueId>
//
// See PendingTasks for more details.
func (queue *Queue) PendingTasks_SignedURL(taskQueueId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/pending/"+url.QueryEscape(taskQueueId), nil, duration)
}

// Stability: *** DEPRECATED ***
//
// Get all active worker-types for the given provisioner.
//
// The response is paged. If this end-point returns a `continuationToken`, you
// should call the end-point again with the `continuationToken` as a query-string
// option. By default this end-point will list up to 1000 worker-types in a single
// page. You may limit this with the query-string parameter `limit`.
//
// Required scopes:
//
//	queue:list-worker-types:<provisionerId>
//
// See #listWorkerTypes
func (queue *Queue) ListWorkerTypes(provisionerId, continuationToken, limit string) (*ListWorkerTypesResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types", new(ListWorkerTypesResponse), v)
	return responseObject.(*ListWorkerTypesResponse), err
}

// Returns a signed URL for ListWorkerTypes, valid for the specified duration.
//
// Required scopes:
//
//	queue:list-worker-types:<provisionerId>
//
// See ListWorkerTypes for more details.
func (queue *Queue) ListWorkerTypes_SignedURL(provisionerId, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types", v, duration)
}

// Stability: *** DEPRECATED ***
//
// Get a worker-type from a provisioner.
//
// Required scopes:
//
//	queue:get-worker-type:<provisionerId>/<workerType>
//
// See #getWorkerType
func (queue *Queue) GetWorkerType(provisionerId, workerType string) (*WorkerTypeResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType), new(WorkerTypeResponse), nil)
	return responseObject.(*WorkerTypeResponse), err
}

// Returns a signed URL for GetWorkerType, valid for the specified duration.
//
// Required scopes:
//
//	queue:get-worker-type:<provisionerId>/<workerType>
//
// See GetWorkerType for more details.
func (queue *Queue) GetWorkerType_SignedURL(provisionerId, workerType string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType), nil, duration)
}

// Stability: *** DEPRECATED ***
//
// Declare a workerType, supplying some details about it.
//
// `declareWorkerType` allows updating one or more properties of a worker-type as long as the required scopes are
// possessed. For example, a request to update the `highmem` worker-type within the `my-provisioner`
// provisioner with a body `{description: 'This worker type is great'}` would require you to have the scope
// `queue:declare-worker-type:my-provisioner/highmem#description`.
//
// Required scopes:
//
//	For property in properties each queue:declare-worker-type:<provisionerId>/<workerType>#<property>
//
// See #declareWorkerType
func (queue *Queue) DeclareWorkerType(provisionerId, workerType string, payload *WorkerTypeRequest) (*WorkerTypeResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType), new(WorkerTypeResponse), nil)
	return responseObject.(*WorkerTypeResponse), err
}

// Get all active task queues.
//
// The response is paged. If this end-point returns a `continuationToken`, you
// should call the end-point again with the `continuationToken` as a query-string
// option. By default this end-point will list up to 1000 task queues in a single
// page. You may limit this with the query-string parameter `limit`.
//
// Required scopes:
//
//	queue:list-task-queues
//
// See #listTaskQueues
func (queue *Queue) ListTaskQueues(continuationToken, limit string) (*ListTaskQueuesResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task-queues", new(ListTaskQueuesResponse), v)
	return responseObject.(*ListTaskQueuesResponse), err
}

// Returns a signed URL for ListTaskQueues, valid for the specified duration.
//
// Required scopes:
//
//	queue:list-task-queues
//
// See ListTaskQueues for more details.
func (queue *Queue) ListTaskQueues_SignedURL(continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task-queues", v, duration)
}

// Get a task queue.
//
// Required scopes:
//
//	queue:get-task-queue:<taskQueueId>
//
// See #getTaskQueue
func (queue *Queue) GetTaskQueue(taskQueueId string) (*TaskQueueResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task-queues/"+url.QueryEscape(taskQueueId), new(TaskQueueResponse), nil)
	return responseObject.(*TaskQueueResponse), err
}

// Returns a signed URL for GetTaskQueue, valid for the specified duration.
//
// Required scopes:
//
//	queue:get-task-queue:<taskQueueId>
//
// See GetTaskQueue for more details.
func (queue *Queue) GetTaskQueue_SignedURL(taskQueueId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task-queues/"+url.QueryEscape(taskQueueId), nil, duration)
}

// Stability: *** DEPRECATED ***
//
// Get a list of all active workers of a workerType.
//
// `listWorkers` allows a response to be filtered by quarantined and non quarantined workers.
// To filter the query, you should call the end-point with `quarantined` as a query-string option with a
// true or false value.
//
// The response is paged. If this end-point returns a `continuationToken`, you
// should call the end-point again with the `continuationToken` as a query-string
// option. By default this end-point will list up to 1000 workers in a single
// page. You may limit this with the query-string parameter `limit`.
//
// Required scopes:
//
//	queue:list-workers:<provisionerId>/<workerType>
//
// See #listWorkers
func (queue *Queue) ListWorkers(provisionerId, workerType, continuationToken, limit, quarantined string) (*ListWorkersResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	if quarantined != "" {
		v.Add("quarantined", quarantined)
	}
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType)+"/workers", new(ListWorkersResponse), v)
	return responseObject.(*ListWorkersResponse), err
}

// Returns a signed URL for ListWorkers, valid for the specified duration.
//
// Required scopes:
//
//	queue:list-workers:<provisionerId>/<workerType>
//
// See ListWorkers for more details.
func (queue *Queue) ListWorkers_SignedURL(provisionerId, workerType, continuationToken, limit, quarantined string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	if quarantined != "" {
		v.Add("quarantined", quarantined)
	}
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType)+"/workers", v, duration)
}

// Stability: *** DEPRECATED ***
//
// Get a worker from a worker-type.
//
// Required scopes:
//
//	queue:get-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>
//
// See #getWorker
func (queue *Queue) GetWorker(provisionerId, workerType, workerGroup, workerId string) (*WorkerResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType)+"/workers/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), new(WorkerResponse), nil)
	return responseObject.(*WorkerResponse), err
}

// Returns a signed URL for GetWorker, valid for the specified duration.
//
// Required scopes:
//
//	queue:get-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>
//
// See GetWorker for more details.
func (queue *Queue) GetWorker_SignedURL(provisionerId, workerType, workerGroup, workerId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType)+"/workers/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// # Quarantine a worker
//
// Required scopes:
//
//	queue:quarantine-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>
//
// See #quarantineWorker
func (queue *Queue) QuarantineWorker(provisionerId, workerType, workerGroup, workerId string, payload *QuarantineWorkerRequest) (*WorkerResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType)+"/workers/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), new(WorkerResponse), nil)
	return responseObject.(*WorkerResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Declare a worker, supplying some details about it.
//
// `declareWorker` allows updating one or more properties of a worker as long as the required scopes are
// possessed.
//
// Required scopes:
//
//	For property in properties each queue:declare-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>#<property>
//
// See #declareWorker
func (queue *Queue) DeclareWorker(provisionerId, workerType, workerGroup, workerId string, payload *WorkerRequest) (*WorkerResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType)+"/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), new(WorkerResponse), nil)
	return responseObject.(*WorkerResponse), err
}

// Respond with a service heartbeat.
//
// This endpoint is used to check on backing services this service
// depends on.
//
// See #heartbeat
func (queue *Queue) Heartbeat() error {
	cd := tcclient.Client(*queue)
	_, _, err := (&cd).APICall(nil, "GET", "/__heartbeat__", nil, nil)
	return err
}
