// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
//
// go generate

package client

type AzureSharedAccessSignatureResponse struct {
	// Shared-Access-Signature string. This is the querystring parameters to
	// be appened after `?` or `&` depending on whether or not a querystring is
	// already present in the URL.
	sas string
	// Date and time of when the Shared-Access-Signature expires.
	expiry string
}

type GetClientCredentialsResponse struct {
	// ClientId of the client scopes is requested about
	clientId string
	// AccessToken used for authenticating requests
	accessToken string
	// List of scopes the client is authorized to access
	scopes []string
	// Date and time where the clients credentials are set to expire
	expires string
}

type GetClientScopesResponse struct {
	// ClientId of the client scopes is requested about
	clientId string
	// List of scopes the client is authorized to access
	scopes []string
	// Date and time where the clients credentials are set to expire
	expires string
}

type GetClientCredentialsResponse1 struct {
	// Human readable name of this set of credentials, typical
	// component/server-name or IRC nickname of the user.
	name string
	// Description of what these credentials are used for in markdown.
	// Please write a few details here, including who is the owner, point of
	// contact. Why it is scoped as is, think of this as documentation.
	description string
	// List of scopes the client is authorized to access
	scopes []string
	// Date and time where the clients credentials are set to expire
	expires string
}

type GetClientResponse struct {
	// ClientId of the client scopes is requested about
	clientId string
	// AccessToken used for authenticating requests
	accessToken string
	// List of scopes the client is authorized to access
	scopes []string
	// Date and time where the clients credentials are set to expire
	expires string
	// Human readable name of this set of credentials, typical
	// component/server-name or IRC nickname of the user.
	name string
	// Description of what these credentials are used for in markdown.
	// Should include who is the owner, point of contact.
	// Why it is scoped as is, think of this as documentation.
	description string
}

type ListClientsResponse struct {
}

type IndexedTaskResponse struct {
	// Date at which this entry expires from the task index.
	expires string
	// Namespace of the indexed task, used to find the indexed task in the index.
	namespace string
	// Unique task identifier, this is UUID encoded as
	// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
	// stripped of `=` padding.
	taskId string
	// If multiple tasks are indexed with the same `namespace` the task with the
	// highest `rank` will be stored and returned in later requests. If two tasks
	// has the same `rank` the latest task will be stored.
	rank number
	// Data that was reported with the task. This is an arbitrary JSON object.
	data object
}

type InsertTaskRequest struct {
	// Unique task identifier, this is UUID encoded as
	// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
	// stripped of `=` padding.
	taskId string
	// If multiple tasks are indexed with the same `namespace` the task with the
	// highest `rank` will be stored and returned in later requests. If two tasks
	// has the same `rank` the latest task will be stored.
	rank number
	// This is an arbitrary JSON object. Feel free to put whatever data you want
	// here, but do limit it, you'll get errors if you store more than 32KB.
	// So stay well, below that limit.
	data object
	// Date at which this entry expires from the task index.
	expires string
}

type ListNamespacesRequest struct {
	// Maximum number of results per page. If there are more results than this
	// a continuation token will be return.
	limit integer
	// A continuation token previously returned in a response to this list
	// request. This property is optional and should not be provided for first
	// requests.
	continuationToken string
}

type ListNamespacesResponse struct {
	// List of namespaces.
	namespaces []object
	// A continuation token is returned if there are more results than listed
	// here. You can optionally provide the token in the request payload to
	// load the additional results.
	continuationToken string
}

type ListTasksRequest struct {
	// A continuation token previously returned in a response to this list
	// request. This property is optional and should not be provided for first
	// requests.
	continuationToken string
	// Maximum number of results per page. If there are more results than this
	// a continuation token will be return.
	limit integer
}

type ListTasksResponse struct {
	// List of tasks.
	tasks []object
	// A continuation token is returned if there are more results than listed
	// here. You can optionally provide the token in the request payload to
	// load the additional results.
	continuationToken string
}

type ArtifactCreatedMessage struct {
	// Information about the artifact that was created
	artifact
	// Message version
	version
	status
	// Id of the run on which artifact was created.
	runId integer
	// Identifier for the worker-group within which the run with the created
	// artifacted is running.
	workerGroup string
	// Identifier for the worker within which the run with the created artifact
	// is running.
	workerId string
}

type WorkClaimRequest struct {
	// Identifier for group that worker claiming the task is a part of.
	workerGroup string
	// Identifier for worker within the given workerGroup
	workerId string
}

type TaskDefinition struct {
	// Required task metadata
	metadata object
	// Unique identifier for a worker-type within a specific provisioner
	workerType string
	// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline
	deadline string
	// Identifier for a group of tasks scheduled together with this task, by
	// scheduler identified by `schedulerId`. For tasks scheduled by the
	// task-graph scheduler, this is the `taskGraphId`.  Defaults to `taskId` if
	// property isn't specified.
	taskGroupId string
	// List of task specific routes, AMQP messages will be CC'ed to these routes.
	routes []string
	// Number of times to retry the task in case of infrastructure issues.
	// An _infrastructure issue_ is a worker node that crashes or is shutdown,
	// these events are to be expected.
	retries integer
	// Creation time of task
	created string
	// List of scopes (or scope-patterns) that the task is
	// authorized to use.
	scopes []string
	// Task-specific payload following worker-specific format. For example the
	// `docker-worker` requires keys like: `image`, `commands` and
	// `features`. Refer to the documentation of `docker-worker` for details.
	payload object
	// Unique identifier for a provisioner, that can supply specified
	// `workerType`
	provisionerId string
	// Identifier for the scheduler that _defined_ this task, this can be an
	// identifier for a user or a service like the `"task-graph-scheduler"`.
	// Along with the `taskGroupId` this is used to form the permission scope
	// `queue:assume:scheduler-id:<schedulerId>/<taskGroupId>`,
	// this scope is necessary to _schedule_ a defined task, or _rerun_ a task.
	schedulerId string
	// Arbitrary key-value tags (only strings limited to 4k). These can be used
	// to attach informal meta-data to a task. Use this for informal tags that
	// tasks can be classified by. You can also think of strings here as
	// candidates for formal meta-data. Something like
	// `purpose: 'build' || 'test'` is a good example.
	tags object
	// Object with properties that can hold any kind of extra data that should be
	// associated with the task. This can be data for the task which doesn't
	// fit into `payload`, or it can supplementary data for use in services
	// listening for events from this task. For example this could be details to
	// display on _treeherder_, or information for indexing the task. Please, try
	// to put all related information under one property, so `extra` data keys
	// for treeherder reporting and task indexing don't conflict, hence, we have
	// reusable services. **Warning**, do not stuff large data-sets in here,
	// task definitions should not take-up multiple MiBs.
	extra object
}

type ListArtifactsResponse struct {
	// List of artifacts for given `taskId` and `runId`.
	artifacts []Artifact
}

type PollTaskUrlsResponse struct {
	// List of signed URLs to poll tasks from, they must be called in the order
	// they are given. As the first entry in this array **may** have higher
	// priority.
	signedPollTaskUrls []string
	// Date and time after which the signed URLs provided in this response
	// expires and not longer works for authentication.
	expires string
}

type PostArtifactRequest struct {
}

type PostArtifactResponse struct {
}

type TaskClaimRequest struct {
	// Identifier for group that worker claiming the task is a part of.
	workerGroup string
	// Identifier for worker within the given workerGroup
	workerId string
	// MessageId from Azure Queue message
	messageId string
	// PopReceipt from Azure Queue message
	receipt string
	// Signature from the MessageText in Azure Queue message
	signature string
}

type TaskClaimResponse struct {
	// Identifier for the worker executing this run.
	workerId string
	// Time at which the run expires and is resolved as `failed`, if the run isn't reclaimed.
	takenUntil string
	status
	// `run-id` assigned to this run of the task
	runId integer
	// Identifier for the worker-group within which this run started.
	workerGroup string
}

type TaskCompletedMessage struct {
	// Message version
	version
	status
	// Id of the run that completed the task
	runId integer
	// Identifier for the worker-group within which this run ran.
	workerGroup string
	// Identifier for the worker that executed this run.
	workerId string
}

type TaskCompletedRequest struct {
	// True, if task is completed, and false if task is failed. This property
	// is optional and only present for backwards compatibility. It will be
	// removed in the future.
	success boolean
}

type TaskDefinedMessage struct {
	// Message version
	version
	status
}

type TaskExceptionMessage struct {
	status
	// Id of the last run for the task, not provided if `deadline`
	// was exceeded before a run was started.
	runId integer
	// Identifier for the worker-group within which the last attempt of the task
	// ran. Not provided, if `deadline` was exceeded before a run was started.
	workerGroup string
	// Identifier for the last worker that failed to report, causing the task
	// to fail. Not provided, if `deadline` was exceeded before a run
	// was started.
	workerId string
	// Message version
	version
}

type TaskExceptionRequest struct {
	// Reason that the task is resolved with an exception. This is a subset
	// of the values for `resolvedReason` given in the task status structure.
	// Please, report `worker-shutdown` if the run failed because the worker
	// had to shutdown (spot node disappearing).
	// And report `malformed-payload` if the `task.payload` doesn't match the
	// schema for the worker payload, or referenced dependencies doesn't exists.
	// In either case, you should still log the error to a log file under the
	// specific run.
	reason
}

type TaskFailedMessage struct {
	// Message version
	version
	status
	// Id of the run that failed.
	runId integer
	// Identifier for the worker-group within which this run ran.
	workerGroup string
	// Identifier for the worker that executed this run.
	workerId string
}

type TaskPendingMessage struct {
	// Message version
	version
	status
	// Id of run that became pending, `run-id`s always starts from 0
	runId integer
}

type TaskRunningMessage struct {
	// Message version
	version
	status
	// Id of the run that just started, always starts from 0
	runId integer
	// Identifier for the worker-group within which this run started.
	workerGroup string
	// Identifier for the worker executing this run.
	workerId string
	// Time at which the run expires and is resolved as `failed`, if the run
	// isn't reclaimed.
	takenUntil string
}

type TaskStatusResponse struct {
	status
}

type TaskStatusStructure struct {
	// State of this task. This is just an auxiliary property derived from state
	// of latests run, or `unscheduled` if none.
	state
	// Unique identifier for the provisioner that this task must be scheduled on
	provisionerId string
	// Identifier for worker type within the specified provisioner
	workerType string
	// Identifier for the scheduler that _defined_ this task.
	schedulerId string
	// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline
	deadline string
	// Unique task identifier, this is UUID encoded as
	// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
	// stripped of `=` padding.
	taskId string
	// Identifier for a group of tasks scheduled together with this task, by
	// scheduler identified by `schedulerId`. For tasks scheduled by the
	// task-graph scheduler, this is the `taskGraphId`.
	taskGroupId string
	// Number of retries left for the task in case of infrastructure issues
	retriesLeft integer
	// List of runs, ordered so that index `i` has `runId == i`
	runs []object
}

type TaskDefinition1 struct {
	// List of task specific routes, AMQP messages will be CC'ed to these routes.
	routes []string
	// List of scopes (or scope-patterns) that the task is
	// authorized to use.
	scopes []string
	// Task-specific payload following worker-specific format. For example the
	// `docker-worker` requires keys like: `image`, `commands` and
	// `features`. Refer to the documentation of `docker-worker` for details.
	payload object
	// Required task metadata
	metadata object
	// Arbitrary key-value tags (only strings limited to 4k). These can be used
	// to attach informal meta-data to a task. Use this for informal tags that
	// tasks can be classified by. You can also think of strings here as
	// candidates for formal meta-data. Something like
	// `purpose: 'build' || 'test'` is a good example.
	tags object
	// Object with properties that can hold any kind of extra data that should be
	// associated with the task. This can be data for the task which doesn't
	// fit into `payload`, or it can supplementary data for use in services
	// listening for events from this task. For example this could be details to
	// display on _treeherder_, or information for indexing the task. Please, try
	// to put all related information under one property, so `extra` data keys
	// for treeherder reporting and task indexing don't conflict, hence, we have
	// reusable services. **Warning**, do not stuff large data-sets in here,
	// task definitions should not take-up multiple MiBs.
	extra object
	// Unique identifier for a provisioner, that can supply specified
	// `workerType`
	provisionerId string
	// Identifier for the scheduler that _defined_ this task, this can be an
	// identifier for a user or a service like the `"task-graph-scheduler"`.
	// Along with the `taskGroupId` this is used to form the permission scope
	// `queue:assume:scheduler-id:<schedulerId>/<taskGroupId>`,
	// this scope is necessary to _schedule_ a defined task, or _rerun_ a task.
	schedulerId string
	// Number of times to retry the task in case of infrastructure issues.
	// An _infrastructure issue_ is a worker node that crashes or is shutdown,
	// these events are to be expected.
	retries integer
	// Creation time of task
	created string
	// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline
	deadline string
	// Unique identifier for a worker-type within a specific provisioner
	workerType string
	// Identifier for a group of tasks scheduled together with this task, by
	// scheduler identified by `schedulerId`. For tasks scheduled by the
	// task-graph scheduler, this is the `taskGraphId`.  Defaults to `taskId` if
	// property isn't specified.
	taskGroupId string
}

type TaskGraphDefinition struct {
	// List of nodes in the task-graph, each featuring a task definition and scheduling preferences, such as number of _reruns_ to attempt.
	tasks []object
}

type InspectTaskGraphResponse struct {
	status
	// Mapping from task-labels to task information and state.
	tasks []object
	// Required task metadata
	metadata object
	// Arbitrary key-value tags (only strings limited to 4k)
	tags object
}

type InspectTaskGraphTaskResponse struct {
	// Unique task identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
	taskId string
	// Human readable name from the task definition
	name string
	// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
	reruns integer
	// State of the task as considered by the scheduler
	state
	// true, if the scheduler considers the task node as satisfied and hence no-longer prevents dependent tasks from running.
	satisfied boolean
	// List of `taskId`s that requires this task to be _complete successfully_ before they can be scheduled.
	dependents []string
	// List of required `taskId`s
	requires []string
	// List of `taskId`s that have yet to complete successfully, before this task can be scheduled.
	requiresLeft []string
	// Number of reruns that haven't been used yet.
	rerunsLeft integer
}

type BlockedTaskGraphMessage struct {
	// Unique `taskId` that is blocking this task-graph from completion.
	taskId string
	// Message version
	version
	status
}

type TaskGraphExtendedMessage struct {
	// Message version
	version
	status
}

type TaskGraphFinishedMessage struct {
	// Message version
	version
	status
}

type TaskGraphInfoResponse struct {
	// Required task metadata
	metadata object
	// Arbitrary key-value tags (only strings limited to 4k)
	tags object
	status
}

type NewTaskGraphMessage struct {
	// Message version
	version
	status
}

type TaskGraphStatusResponse struct {
	status
}

type TaskGraphStatusResponse1 struct {
	status
}

type TaskGraphStatusStructure struct {
	// Unique task-graph identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
	taskGraphId string
	// Unique identifier for task-graph scheduler managing the given task-graph
	schedulerId string
	// Task-graph state, this enum is **frozen** new values will **not** be added.
	state
}

type TaskGraphDefinition1 struct {
	// List of scopes (or scope-patterns) that tasks of the task-graph is
	// authorized to use.
	scopes []string
	// List of task-graph specific routes, AMQP messages will be CC'ed to these
	// routes prefixed by `'route.'`.
	routes []string
	// List of nodes in the task-graph, each featuring a task definition and scheduling preferences, such as number of _reruns_ to attempt.
	tasks []object
	// Required task metadata"
	metadata object
	// Arbitrary key-value tags (only strings limited to 4k)
	tags object
}
