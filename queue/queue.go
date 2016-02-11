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
// First create a Queue object:
//
//  myQueue := queue.New(&tcclient.Credentials{ClientId: "myClientId", AccessToken: "myAccessToken"})
//
// and then call one or more of myQueue's methods, e.g.:
//
//  data, callSummary, err := myQueue.Task(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/queue/v1/api.json together with the input and output schemas it references, downloaded on
// Thu, 11 Feb 2016 at 20:28:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package queue

import (
	"net/url"
	"time"

	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

type Queue tcclient.ConnectionData

// Returns a pointer to Queue, configured to run against production.  If you
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
//  myQueue := queue.New(creds)                              // set credentials
//  myQueue.Authenticate = false                             // disable authentication (creds above are now ignored)
//  myQueue.BaseURL = "http://localhost:1234/api/Queue/v1"   // alternative API endpoint (production by default)
//  data, callSummary, err := myQueue.Task(.....)            // for example, call the Task(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Queue {
	myQueue := Queue(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://queue.taskcluster.net/v1",
		Authenticate: true,
	})
	return &myQueue
}

// This end-point will return the task-definition. Notice that the task
// definition may have been modified by queue, if an optional property isn't
// specified the queue may provide a default value.
//
// See http://docs.taskcluster.net/queue/api-docs/#task
func (myQueue *Queue) Task(taskId string) (*TaskDefinitionResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId), new(TaskDefinitionResponse), nil)
	return responseObject.(*TaskDefinitionResponse), callSummary, err
}

// Get task status structure from `taskId`
//
// See http://docs.taskcluster.net/queue/api-docs/#status
func (myQueue *Queue) Status(taskId string) (*TaskStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/status", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), callSummary, err
}

// List taskIds of all tasks sharing the same `taskGroupId`.
//
// As a task-group may contain an unbounded number of tasks, this end-point
// may return a `continuationToken`. To continue listing tasks you must
// `listTaskGroup` again with the `continuationToken` as the query-string
// option `continuationToken`.
//
// By default this end-point will try to return up to 1000 members in one
// request. But it **may return less**, even if more tasks are available.
// It may also return a `continuationToken` even though there are no more
// results. However, you can only be sure to have seen all results if you
// keep calling `listTaskGroup` with the last `continationToken` until you
// get a result without a `continuationToken`.
//
// If you're not interested in listing all the members at once, you may
// use the query-string option `limit` to return fewer.
//
// See http://docs.taskcluster.net/queue/api-docs/#listTaskGroup
func (myQueue *Queue) ListTaskGroup(taskGroupId, continuationToken, limit string) (*ListTaskGroupResponse, *tcclient.CallSummary, error) {
	v := url.Values{}
	v.Add("continuationToken", continuationToken)
	v.Add("limit", limit)
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/task-group/"+url.QueryEscape(taskGroupId)+"/list", new(ListTaskGroupResponse), v)
	return responseObject.(*ListTaskGroupResponse), callSummary, err
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
// routing-key: `<route>`, then when the AMQP message about the task is
// published, the message will be CC'ed with the routing-key:
// `route.<route>`. This is useful if you want another component to listen
// for completed tasks you have posted.
//
// **Important** Any scopes the task requires are also required for creating
// the task. Please see the Request Payload (Task Definition) for details.
//
// Required scopes:
//   * queue:create-task:<provisionerId>/<workerType>, or
//   * (queue:define-task:<provisionerId>/<workerType> and queue:task-group-id:<schedulerId>/<taskGroupId> and queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>)
//
// See http://docs.taskcluster.net/queue/api-docs/#createTask
func (myQueue *Queue) CreateTask(taskId string, payload *TaskDefinitionRequest) (*TaskStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(payload, "PUT", "/task/"+url.QueryEscape(taskId), new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), callSummary, err
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
// **Important** Any scopes the task requires are also required for defining
// the task. Please see the Request Payload (Task Definition) for details.
//
// **Note** this operation is **idempotent**, as long as you upload the same
// task definition as previously defined this operation is safe to retry.
//
// Required scopes:
//   * queue:define-task:<provisionerId>/<workerType>, or
//   * queue:create-task:<provisionerId>/<workerType>, or
//   * (queue:define-task:<provisionerId>/<workerType> and queue:task-group-id:<schedulerId>/<taskGroupId>)
//
// See http://docs.taskcluster.net/queue/api-docs/#defineTask
func (myQueue *Queue) DefineTask(taskId string, payload *TaskDefinitionRequest) (*TaskStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(payload, "POST", "/task/"+url.QueryEscape(taskId)+"/define", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), callSummary, err
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
// Required scopes:
//   * (queue:schedule-task and assume:scheduler-id:<schedulerId>/<taskGroupId>), or
//   * queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>
//
// See http://docs.taskcluster.net/queue/api-docs/#scheduleTask
func (myQueue *Queue) ScheduleTask(taskId string) (*TaskStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/schedule", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), callSummary, err
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
// isn't either `failed` or `completed`, this operation will just return the
// current task status.
//
// Required scopes:
//   * (queue:rerun-task and assume:scheduler-id:<schedulerId>/<taskGroupId>), or
//   * queue:rerun-task:<schedulerId>/<taskGroupId>/<taskId>
//
// See http://docs.taskcluster.net/queue/api-docs/#rerunTask
func (myQueue *Queue) RerunTask(taskId string) (*TaskStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/rerun", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), callSummary, err
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
//   * (queue:cancel-task and assume:scheduler-id:<schedulerId>/<taskGroupId>), or
//   * queue:cancel-task:<schedulerId>/<taskGroupId>/<taskId>
//
// See http://docs.taskcluster.net/queue/api-docs/#cancelTask
func (myQueue *Queue) CancelTask(taskId string) (*TaskStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/cancel", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), callSummary, err
}

// Get a signed URLs to get and delete messages from azure queue.
// Once messages are polled from here, you can claim the referenced task
// with `claimTask`, and afterwards you should always delete the message.
//
// Required scopes:
//   * (queue:poll-task-urls and assume:worker-type:<provisionerId>/<workerType>), or
//   * queue:poll-task-urls:<provisionerId>/<workerType>
//
// See http://docs.taskcluster.net/queue/api-docs/#pollTaskUrls
func (myQueue *Queue) PollTaskUrls(provisionerId, workerType string) (*PollTaskUrlsResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/poll-task-url/"+url.QueryEscape(provisionerId)+"/"+url.QueryEscape(workerType), new(PollTaskUrlsResponse), nil)
	return responseObject.(*PollTaskUrlsResponse), callSummary, err
}

// Returns a signed URL for PollTaskUrls, valid for the specified duration.
//
// Required scopes:
//   * (queue:poll-task-urls and assume:worker-type:<provisionerId>/<workerType>), or
//   * queue:poll-task-urls:<provisionerId>/<workerType>
//
// See PollTaskUrls for more details.
func (myQueue *Queue) PollTaskUrls_SignedURL(provisionerId, workerType string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.ConnectionData(*myQueue)
	return (&cd).SignedURL("/poll-task-url/"+url.QueryEscape(provisionerId)+"/"+url.QueryEscape(workerType), nil, duration)
}

// claim a task, more to be added later...
//
// Required scopes:
//   * (queue:claim-task and assume:worker-type:<provisionerId>/<workerType> and assume:worker-id:<workerGroup>/<workerId>), or
//   * (queue:claim-task:<provisionerId>/<workerType> and queue:worker-id:<workerGroup>/<workerId>)
//
// See http://docs.taskcluster.net/queue/api-docs/#claimTask
func (myQueue *Queue) ClaimTask(taskId, runId string, payload *TaskClaimRequest) (*TaskClaimResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(payload, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/claim", new(TaskClaimResponse), nil)
	return responseObject.(*TaskClaimResponse), callSummary, err
}

// reclaim a task more to be added later...
//
// Required scopes:
//   * (queue:claim-task and assume:worker-id:<workerGroup>/<workerId>), or
//   * queue:reclaim-task:<taskId>/<runId>
//
// See http://docs.taskcluster.net/queue/api-docs/#reclaimTask
func (myQueue *Queue) ReclaimTask(taskId, runId string) (*TaskReclaimResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/reclaim", new(TaskReclaimResponse), nil)
	return responseObject.(*TaskReclaimResponse), callSummary, err
}

// Report a task completed, resolving the run as `completed`.
//
// Required scopes:
//   * (queue:resolve-task and assume:worker-id:<workerGroup>/<workerId>), or
//   * queue:resolve-task:<taskId>/<runId>
//
// See http://docs.taskcluster.net/queue/api-docs/#reportCompleted
func (myQueue *Queue) ReportCompleted(taskId, runId string) (*TaskStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/completed", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), callSummary, err
}

// Report a run failed, resolving the run as `failed`. Use this to resolve
// a run that failed because the task specific code behaved unexpectedly.
// For example the task exited non-zero, or didn't produce expected output.
//
// Don't use this if the task couldn't be run because if malformed payload,
// or other unexpected condition. In these cases we have a task exception,
// which should be reported with `reportException`.
//
// Required scopes:
//   * (queue:resolve-task and assume:worker-id:<workerGroup>/<workerId>), or
//   * queue:resolve-task:<taskId>/<runId>
//
// See http://docs.taskcluster.net/queue/api-docs/#reportFailed
func (myQueue *Queue) ReportFailed(taskId, runId string) (*TaskStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/failed", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), callSummary, err
}

// Resolve a run as _exception_. Generally, you will want to report tasks as
// failed instead of exception. You should `reportException` if,
//
//   * The `task.payload` is invalid,
//   * Non-existent resources are referenced,
//   * Declared actions cannot be executed due to unavailable resources,
//   * The worker had to shutdown prematurely, or,
//   * The worker experienced an unknown error.
//
// Do not use this to signal that some user-specified code crashed for any
// reason specific to this code. If user-specific code hits a resource that
// is temporarily unavailable worker should report task _failed_.
//
// Required scopes:
//   * (queue:resolve-task and assume:worker-id:<workerGroup>/<workerId>), or
//   * queue:resolve-task:<taskId>/<runId>
//
// See http://docs.taskcluster.net/queue/api-docs/#reportException
func (myQueue *Queue) ReportException(taskId, runId string, payload *TaskExceptionRequest) (*TaskStatusResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(payload, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/exception", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), callSummary, err
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
// Required scopes:
//   * (queue:create-artifact:<name> and assume:worker-id:<workerGroup>/<workerId>), or
//   * queue:create-artifact:<taskId>/<runId>
//
// See http://docs.taskcluster.net/queue/api-docs/#createArtifact
func (myQueue *Queue) CreateArtifact(taskId, runId, name string, payload *PostArtifactRequest) (*PostArtifactResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(payload, "POST", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts/"+url.QueryEscape(name), new(PostArtifactResponse), nil)
	return responseObject.(*PostArtifactResponse), callSummary, err
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
// Required scopes:
//   * queue:get-artifact:<name>
//
// See http://docs.taskcluster.net/queue/api-docs/#getArtifact
func (myQueue *Queue) GetArtifact(taskId, runId, name string) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts/"+url.QueryEscape(name), nil, nil)
	return callSummary, err
}

// Returns a signed URL for GetArtifact, valid for the specified duration.
//
// Required scopes:
//   * queue:get-artifact:<name>
//
// See GetArtifact for more details.
func (myQueue *Queue) GetArtifact_SignedURL(taskId, runId, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.ConnectionData(*myQueue)
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
//   * queue:get-artifact:<name>
//
// See http://docs.taskcluster.net/queue/api-docs/#getLatestArtifact
func (myQueue *Queue) GetLatestArtifact(taskId, name string) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/artifacts/"+url.QueryEscape(name), nil, nil)
	return callSummary, err
}

// Returns a signed URL for GetLatestArtifact, valid for the specified duration.
//
// Required scopes:
//   * queue:get-artifact:<name>
//
// See GetLatestArtifact for more details.
func (myQueue *Queue) GetLatestArtifact_SignedURL(taskId, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.ConnectionData(*myQueue)
	return (&cd).SignedURL("/task/"+url.QueryEscape(taskId)+"/artifacts/"+url.QueryEscape(name), nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// Returns a list of artifacts and associated meta-data for a given run.
//
// See http://docs.taskcluster.net/queue/api-docs/#listArtifacts
func (myQueue *Queue) ListArtifacts(taskId, runId string) (*ListArtifactsResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/runs/"+url.QueryEscape(runId)+"/artifacts", new(ListArtifactsResponse), nil)
	return responseObject.(*ListArtifactsResponse), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Returns a list of artifacts and associated meta-data for the latest run
// from the given task.
//
// See http://docs.taskcluster.net/queue/api-docs/#listLatestArtifacts
func (myQueue *Queue) ListLatestArtifacts(taskId string) (*ListArtifactsResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(taskId)+"/artifacts", new(ListArtifactsResponse), nil)
	return responseObject.(*ListArtifactsResponse), callSummary, err
}

// Get an approximate number of pending tasks for the given `provisionerId`
// and `workerType`.
//
// The underlying Azure Storage Queues only promises to give us an estimate.
// Furthermore, we cache the result in memory for 20 seconds. So consumers
// should be no means expect this to be an accurate number.
// It is, however, a solid estimate of the number of pending tasks.
//
// See http://docs.taskcluster.net/queue/api-docs/#pendingTasks
func (myQueue *Queue) PendingTasks(provisionerId, workerType string) (*CountPendingTasksResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/pending/"+url.QueryEscape(provisionerId)+"/"+url.QueryEscape(workerType), new(CountPendingTasksResponse), nil)
	return responseObject.(*CountPendingTasksResponse), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/queue/api-docs/#ping
func (myQueue *Queue) Ping() (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myQueue)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return callSummary, err
}
