// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://references.taskcluster.net/queue/v1/api.json

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
// See: https://docs.taskcluster.net/reference/platform/queue/api-docs
//
// How to use this package
//
// First create a Queue object:
//
//  queue := tcqueue.New(nil)
//
// and then call one or more of queue's methods, e.g.:
//
//  err := queue.Ping(.....)
//
// handling any errors...
//
//  if err != nil {
//  	// handle error...
//  }
//
// Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// https://references.taskcluster.net/queue/v1/api.json together with the input and output schemas it references, downloaded on
// Thu, 4 Oct 2018 at 08:23:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package tcqueue

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

const (
	DefaultBaseURL = "https://queue.taskcluster.net/v1"
)

type Queue tcclient.Client

// New returns a Queue client, configured to run against production. Pass in
// nil to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  queue := tcqueue.New(nil)                              // client without authentication
//  queue.BaseURL = "http://localhost:1234/api/Queue/v1"   // alternative API endpoint (production by default)
//  err := queue.Ping(.....)                               // for example, call the Ping(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Queue {
	return &Queue{
		Credentials:  credentials,
		BaseURL:      DefaultBaseURL,
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns a Queue client with credentials taken from the environment variables:
//
//  TASKCLUSTER_CLIENT_ID
//  TASKCLUSTER_ACCESS_TOKEN
//  TASKCLUSTER_CERTIFICATE
//
// If environment variables TASKCLUSTER_CLIENT_ID is empty string or undefined
// authentication will be disabled.
func NewFromEnv() *Queue {
	c := tcclient.CredentialsFromEnvVars()
	return &Queue{
		Credentials:  c,
		BaseURL:      DefaultBaseURL,
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#ping
func (queue *Queue) Ping() error {
	cd := tcclient.Client(*queue)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// This end-point will return the task-definition. Notice that the task
// definition may have been modified by queue, if an optional property is
// not specified the queue may provide a default value.
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#task
func (queue *Queue) Task(taskId string) (*TaskDefinitionResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId), new(TaskDefinitionResponse), nil)
	return responseObject.(*TaskDefinitionResponse), err
}

// Get task status structure from `taskId`
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#status
func (queue *Queue) Status(taskId string) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/status", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
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
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#listTaskGroup
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
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#listDependentTasks
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

// Create a new task, this is an **idempotent** operation, so repeat it if
// you get an internal server error or network connection is dropped.
//
// **Task `deadline`**: the deadline property can be no more than 5 days
// into the future. This is to limit the amount of pending tasks not being
// taken care of. Ideally, you should use a much shorter deadline.
//
// **Task expiration**: the `expires` property must be greater than the
// task `deadline`. If not provided it will default to `deadline` + one
// year. Notice, that artifacts created by task must expire before the task.
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
// **Legacy Scopes**: The `queue:create-task:..` scope without a priority and
// the `queue:define-task:..` and `queue:task-group-id:..` scopes are considered
// legacy and should not be used. Note that the new, non-legacy scopes require
// a `queue:scheduler-id:..` scope as well as scopes for the proper priority.
//
// Required scopes:
//   All of:
//   * For scope in scopes each <scope>
//   * For route in routes each queue:route:<route>
//   * Any of:
//     - All of:
//       * queue:scheduler-id:<schedulerId>
//       * For priority in priorities each queue:create-task:<priority>:<provisionerId>/<workerType>
//     - If legacyScopes:
//         Any of:
//         - queue:create-task:<provisionerId>/<workerType>
//         - All of:
//           * queue:define-task:<provisionerId>/<workerType>
//           * queue:task-group-id:<schedulerId>/<taskGroupId>
//           * queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#createTask
func (queue *Queue) CreateTask(taskId string, payload *TaskDefinitionRequest) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/task/"+url.QueryEscape(taskId), new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
}

// Stability: *** DEPRECATED ***
//
// **Deprecated**, this is the same as `createTask` with a **self-dependency**.
// This is only present for legacy.
//
// Required scopes:
//   All of:
//   * For scope in scopes each <scope>
//   * For route in routes each queue:route:<route>
//   * Any of:
//     - All of:
//       * queue:scheduler-id:<schedulerId>
//       * For priority in priorities each queue:create-task:<priority>:<provisionerId>/<workerType>
//     - If legacyScopes:
//         Any of:
//         - queue:define-task:<provisionerId>/<workerType>
//         - queue:create-task:<provisionerId>/<workerType>
//         - All of:
//           * queue:define-task:<provisionerId>/<workerType>
//           * queue:task-group-id:<schedulerId>/<taskGroupId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#defineTask
func (queue *Queue) DefineTask(taskId string, payload *TaskDefinitionRequest) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/task/"+url.QueryEscape(taskId)+"/define", new(TaskStatusResponse), nil)
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
//   Any of:
//   - queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>
//   - All of:
//     * queue:schedule-task
//     * assume:scheduler-id:<schedulerId>/<taskGroupId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#scheduleTask
func (queue *Queue) ScheduleTask(taskId string) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/schedule", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
}

// Stability: *** DEPRECATED ***
//
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
// is not either `failed` or `completed`, this operation will just return
// the current task status.
//
// Required scopes:
//   Any of:
//   - queue:rerun-task:<schedulerId>/<taskGroupId>/<taskId>
//   - All of:
//     * queue:rerun-task
//     * assume:scheduler-id:<schedulerId>/<taskGroupId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#rerunTask
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
//   Any of:
//   - queue:cancel-task:<schedulerId>/<taskGroupId>/<taskId>
//   - All of:
//     * queue:cancel-task
//     * assume:scheduler-id:<schedulerId>/<taskGroupId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#cancelTask
func (queue *Queue) CancelTask(taskId string) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/cancel", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
}

// Claim pending task(s) for the given `provisionerId`/`workerType` queue.
//
// If any work is available (even if fewer than the requested number of
// tasks, this will return immediately. Otherwise, it will block for tens of
// seconds waiting for work.  If no work appears, it will return an emtpy
// list of tasks.  Callers should sleep a short while (to avoid denial of
// service in an error condition) and call the endpoint again.  This is a
// simple implementation of "long polling".
//
// Required scopes:
//   All of:
//   * queue:claim-work:<provisionerId>/<workerType>
//   * queue:worker-id:<workerGroup>/<workerId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#claimWork
func (queue *Queue) ClaimWork(provisionerId, workerType string, payload *ClaimWorkRequest) (*ClaimWorkResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/claim-work/"+url.QueryEscape(provisionerId)+"/"+url.QueryEscape(workerType), new(ClaimWorkResponse), nil)
	return responseObject.(*ClaimWorkResponse), err
}

// Stability: *** DEPRECATED ***
//
// claim a task - never documented
//
// Required scopes:
//   Any of:
//   - All of:
//     * queue:claim-task:<provisionerId>/<workerType>
//     * queue:worker-id:<workerGroup>/<workerId>
//   - All of:
//     * queue:claim-task
//     * assume:worker-type:<provisionerId>/<workerType>
//     * assume:worker-id:<workerGroup>/<workerId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#claimTask
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
//  * Postpone `takenUntil` preventing the queue from resolving
//    `claim-expired`,
//  * Refresh temporary credentials used for processing the task, and
//  * Abort execution if the task/run have been resolved.
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
//   Any of:
//   - queue:reclaim-task:<taskId>/<runId>
//   - All of:
//     * queue:claim-task
//     * assume:worker-id:<workerGroup>/<workerId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#reclaimTask
func (queue *Queue) ReclaimTask(taskId, runId string) (*TaskReclaimResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/reclaim", new(TaskReclaimResponse), nil)
	return responseObject.(*TaskReclaimResponse), err
}

// Report a task completed, resolving the run as `completed`.
//
// Required scopes:
//   Any of:
//   - queue:resolve-task:<taskId>/<runId>
//   - All of:
//     * queue:resolve-task
//     * assume:worker-id:<workerGroup>/<workerId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#reportCompleted
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
//   Any of:
//   - queue:resolve-task:<taskId>/<runId>
//   - All of:
//     * queue:resolve-task
//     * assume:worker-id:<workerGroup>/<workerId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#reportFailed
func (queue *Queue) ReportFailed(taskId, runId string) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/failed", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
}

// Resolve a run as _exception_. Generally, you will want to report tasks as
// failed instead of exception. You should `reportException` if,
//
//   * The `task.payload` is invalid,
//   * Non-existent resources are referenced,
//   * Declared actions cannot be executed due to unavailable resources,
//   * The worker had to shutdown prematurely,
//   * The worker experienced an unknown error, or,
//   * The task explicitly requested a retry.
//
// Do not use this to signal that some user-specified code crashed for any
// reason specific to this code. If user-specific code hits a resource that
// is temporarily unavailable worker should report task _failed_.
//
// Required scopes:
//   Any of:
//   - queue:resolve-task:<taskId>/<runId>
//   - All of:
//     * queue:resolve-task
//     * assume:worker-id:<workerGroup>/<workerId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#reportException
func (queue *Queue) ReportException(taskId, runId string, payload *TaskExceptionRequest) (*TaskStatusResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/exception", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
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
// We currently support 3 different `storageType`s, each storage type have
// slightly different features and in some cases difference semantics.
// We also have 2 deprecated `storageType`s which are only maintained for
// backwards compatiability and should not be used in new implementations
//
// **Blob artifacts**, are useful for storing large files.  Currently, these
// are all stored in S3 but there are facilities for adding support for other
// backends in futre.  A call for this type of artifact must provide information
// about the file which will be uploaded.  This includes sha256 sums and sizes.
// This method will return a list of general form HTTP requests which are signed
// by AWS S3 credentials managed by the Queue.  Once these requests are completed
// the list of `ETag` values returned by the requests must be passed to the
// queue `completeArtifact` method
//
// **S3 artifacts**, DEPRECATED is useful for static files which will be
// stored on S3. When creating an S3 artifact the queue will return a
// pre-signed URL to which you can do a `PUT` request to upload your
// artifact. Note that `PUT` request **must** specify the `content-length`
// header and **must** give the `content-type` header the same value as in
// the request to `createArtifact`.
//
// **Azure artifacts**, DEPRECATED are stored in _Azure Blob Storage_ service
// which given the consistency guarantees and API interface offered by Azure
// is more suitable for artifacts that will be modified during the execution
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
// get a `424` (Failed Dependency) response. This is mainly designed to
// ensure that dependent tasks can distinguish between artifacts that were
// suppose to be generated and artifacts for which the name is misspelled.
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
// Required scopes:
//   Any of:
//   - queue:create-artifact:<taskId>/<runId>
//   - All of:
//     * queue:create-artifact:<name>
//     * assume:worker-id:<workerGroup>/<workerId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#createArtifact
func (queue *Queue) CreateArtifact(taskId, runId, name string, payload *PostArtifactRequest) (*PostArtifactResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts/"+url.QueryEscape(name), new(PostArtifactResponse), nil)
	return responseObject.(*PostArtifactResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint finalises an upload done through the blob `storageType`.
// The queue will ensure that the task/run is still allowing artifacts
// to be uploaded.  For single-part S3 blob artifacts, this endpoint
// will simply ensure the artifact is present in S3.  For multipart S3
// artifacts, the endpoint will perform the commit step of the multipart
// upload flow.  As the final step for both multi and single part artifacts,
// the `present` entity field will be set to `true` to reflect that the
// artifact is now present and a message published to pulse.  NOTE: This
// endpoint *must* be called for all artifacts of storageType 'blob'
//
// Required scopes:
//   Any of:
//   - queue:create-artifact:<taskId>/<runId>
//   - All of:
//     * queue:create-artifact:<name>
//     * assume:worker-id:<workerGroup>/<workerId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#completeArtifact
func (queue *Queue) CompleteArtifact(taskId, runId, name string, payload *CompleteArtifactRequest) error {
	cd := tcclient.Client(*queue)
	_, _, err := (&cd).APICall(payload, "PUT", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts/"+url.QueryEscape(name), nil, nil)
	return err
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
// use that URL with an HTTP client that can handle responses correctly.
//
// **Downloading artifacts**
// There are some special considerations for those http clients which download
// artifacts.  This api endpoint is designed to be compatible with an HTTP 1.1
// compliant client, but has extra features to ensure the download is valid.
// It is strongly recommend that consumers use either taskcluster-lib-artifact (JS),
// taskcluster-lib-artifact-go (Go) or the CLI written in Go to interact with
// artifacts.
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
// 1. A request which has x-taskcluster-artifact-storage-type value of `blob` and does not
// have x-taskcluster-location-content-sha256 or x-taskcluster-location-content-length
// must be treated as an error
//
// **Headers**
// The following important headers are set on the response to this method:
//
// * location: the url of the artifact if a redirect is to be performed
// * x-taskcluster-artifact-storage-type: the storage type.  Example: blob, s3, error
//
// The following important headers are set on responses to this method for Blob artifacts
//
// * x-taskcluster-location-content-sha256: the SHA256 of the artifact
// *after* any content-encoding is undone.  Sha256 is hex encoded (e.g. [0-9A-Fa-f]{64})
// * x-taskcluster-location-content-length: the number of bytes *after* any content-encoding
// is undone
// * x-taskcluster-location-transfer-sha256: the SHA256 of the artifact
// *before* any content-encoding is undone.  This is the SHA256 of what is sent over
// the wire.  Sha256 is hex encoded (e.g. [0-9A-Fa-f]{64})
// * x-taskcluster-location-transfer-length: the number of bytes *after* any content-encoding
// is undone
// * x-taskcluster-location-content-encoding: the content-encoding used.  It will either
// be `gzip` or `identity` right now.  This is hardcoded to a value set when the artifact
// was created and no content-negotiation occurs
// * x-taskcluster-location-content-type: the content-type of the artifact
//
// **Caching**, artifacts may be cached in data centers closer to the
// workers in-order to reduce bandwidth costs. This can lead to longer
// response times. Caching can be skipped by setting the header
// `x-taskcluster-skip-cache: true`, this should only be used for resources
// where request volume is known to be low, and caching not useful.
// (This feature may be disabled in the future, use is sparingly!)
//
// Required scopes:
//   If private:
//     queue:get-artifact:<name>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#getArtifact
func (queue *Queue) GetArtifact(taskId, runId, name string) error {
	cd := tcclient.Client(*queue)
	_, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts/"+url.QueryEscape(name), nil, nil)
	return err
}

// Returns a signed URL for GetArtifact, valid for the specified duration.
//
// Required scopes:
//   If private:
//     queue:get-artifact:<name>
//
// See GetArtifact for more details.
func (queue *Queue) GetArtifact_SignedURL(taskId, runId, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts/"+url.QueryEscape(name), nil, duration)
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
// Required scopes:
//   If private:
//     queue:get-artifact:<name>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#getLatestArtifact
func (queue *Queue) GetLatestArtifact(taskId, name string) error {
	cd := tcclient.Client(*queue)
	_, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/artifacts/"+url.QueryEscape(name), nil, nil)
	return err
}

// Returns a signed URL for GetLatestArtifact, valid for the specified duration.
//
// Required scopes:
//   If private:
//     queue:get-artifact:<name>
//
// See GetLatestArtifact for more details.
func (queue *Queue) GetLatestArtifact_SignedURL(taskId, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*queue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/artifacts/"+url.QueryEscape(name), nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
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
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#listArtifacts
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

// Stability: *** EXPERIMENTAL ***
//
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
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#listLatestArtifacts
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

// Stability: *** EXPERIMENTAL ***
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
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#listProvisioners
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

// Stability: *** EXPERIMENTAL ***
//
// Get an active provisioner.
//
// The term "provisioner" is taken broadly to mean anything with a provisionerId.
// This does not necessarily mean there is an associated service performing any
// provisioning activity.
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#getProvisioner
func (queue *Queue) GetProvisioner(provisionerId string) (*ProvisionerResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/provisioners/"+url.QueryEscape(provisionerId), new(ProvisionerResponse), nil)
	return responseObject.(*ProvisionerResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Declare a provisioner, supplying some details about it.
//
// `declareProvisioner` allows updating one or more properties of a provisioner as long as the required scopes are
// possessed. For example, a request to update the `aws-provisioner-v1`
// provisioner with a body `{description: 'This provisioner is great'}` would require you to have the scope
// `queue:declare-provisioner:aws-provisioner-v1#description`.
//
// The term "provisioner" is taken broadly to mean anything with a provisionerId.
// This does not necessarily mean there is an associated service performing any
// provisioning activity.
//
// Required scopes:
//   For property in properties each queue:declare-provisioner:<provisionerId>#<property>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#declareProvisioner
func (queue *Queue) DeclareProvisioner(provisionerId string, payload *ProvisionerRequest) (*ProvisionerResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/provisioners/"+url.QueryEscape(provisionerId), new(ProvisionerResponse), nil)
	return responseObject.(*ProvisionerResponse), err
}

// Get an approximate number of pending tasks for the given `provisionerId`
// and `workerType`.
//
// The underlying Azure Storage Queues only promises to give us an estimate.
// Furthermore, we cache the result in memory for 20 seconds. So consumers
// should be no means expect this to be an accurate number.
// It is, however, a solid estimate of the number of pending tasks.
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#pendingTasks
func (queue *Queue) PendingTasks(provisionerId, workerType string) (*CountPendingTasksResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/pending/"+url.QueryEscape(provisionerId)+"/"+url.QueryEscape(workerType), new(CountPendingTasksResponse), nil)
	return responseObject.(*CountPendingTasksResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Get all active worker-types for the given provisioner.
//
// The response is paged. If this end-point returns a `continuationToken`, you
// should call the end-point again with the `continuationToken` as a query-string
// option. By default this end-point will list up to 1000 worker-types in a single
// page. You may limit this with the query-string parameter `limit`.
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#listWorkerTypes
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

// Stability: *** EXPERIMENTAL ***
//
// Get a worker-type from a provisioner.
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#getWorkerType
func (queue *Queue) GetWorkerType(provisionerId, workerType string) (*WorkerTypeResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType), new(WorkerTypeResponse), nil)
	return responseObject.(*WorkerTypeResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Declare a workerType, supplying some details about it.
//
// `declareWorkerType` allows updating one or more properties of a worker-type as long as the required scopes are
// possessed. For example, a request to update the `gecko-b-1-w2008` worker-type within the `aws-provisioner-v1`
// provisioner with a body `{description: 'This worker type is great'}` would require you to have the scope
// `queue:declare-worker-type:aws-provisioner-v1/gecko-b-1-w2008#description`.
//
// Required scopes:
//   For property in properties each queue:declare-worker-type:<provisionerId>/<workerType>#<property>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#declareWorkerType
func (queue *Queue) DeclareWorkerType(provisionerId, workerType string, payload *WorkerTypeRequest) (*WorkerTypeResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType), new(WorkerTypeResponse), nil)
	return responseObject.(*WorkerTypeResponse), err
}

// Stability: *** EXPERIMENTAL ***
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
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#listWorkers
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

// Stability: *** EXPERIMENTAL ***
//
// Get a worker from a worker-type.
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#getWorker
func (queue *Queue) GetWorker(provisionerId, workerType, workerGroup, workerId string) (*WorkerResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType)+"/workers/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), new(WorkerResponse), nil)
	return responseObject.(*WorkerResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Quarantine a worker
//
// Required scopes:
//   queue:quarantine-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#quarantineWorker
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
//   For property in properties each queue:declare-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>#<property>
//
// See https://docs.taskcluster.net/reference/platform/queue/api-docs#declareWorker
func (queue *Queue) DeclareWorker(provisionerId, workerType, workerGroup, workerId string, payload *WorkerRequest) (*WorkerResponse, error) {
	cd := tcclient.Client(*queue)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/provisioners/"+url.QueryEscape(provisionerId)+"/worker-types/"+url.QueryEscape(workerType)+"/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), new(WorkerResponse), nil)
	return responseObject.(*WorkerResponse), err
}
