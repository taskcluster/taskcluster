// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
//
// go generate

package client

// Response to a request for an Shared-Access-Signature to access and Azure
// Table Storage table.
type AzureSharedAccessSignatureResponse struct {
	// Date and time of when the Shared-Access-Signature expires.
	expiry string
	// Shared-Access-Signature string. This is the querystring parameters to
	// be appened after `?` or `&` depending on whether or not a querystring is
	// already present in the URL.
	sas string
}

// Credentials, scopes and expiration date for a client
type GetClientCredentialsResponse struct {
	// AccessToken used for authenticating requests
	accessToken string
	// ClientId of the client scopes is requested about
	clientId string
	// Date and time where the clients credentials are set to expire
	expires string
	// List of scopes the client is authorized to access
	scopes []string
}

// Scopes and expiration date for a client
type GetClientScopesResponse struct {
	// ClientId of the client scopes is requested about
	clientId string
	// Date and time where the clients credentials are set to expire
	expires string
	// List of scopes the client is authorized to access
	scopes []string
}

// Credentials, scopes and expiration date for a client
type GetClientCredentialsResponse1 struct {
	// Description of what these credentials are used for in markdown.
	// Please write a few details here, including who is the owner, point of
	// contact. Why it is scoped as is, think of this as documentation.
	description string
	// Date and time where the clients credentials are set to expire
	expires string
	// Human readable name of this set of credentials, typical
	// component/server-name or IRC nickname of the user.
	name string
	// List of scopes the client is authorized to access
	scopes []string
}

// Get all detaisl about a client, useful for tools modifying a client
type GetClientResponse struct {
	// AccessToken used for authenticating requests
	accessToken string
	// ClientId of the client scopes is requested about
	clientId string
	// Description of what these credentials are used for in markdown.
	// Should include who is the owner, point of contact.
	// Why it is scoped as is, think of this as documentation.
	description string
	// Date and time where the clients credentials are set to expire
	expires string
	// Human readable name of this set of credentials, typical
	// component/server-name or IRC nickname of the user.
	name string
	// List of scopes the client is authorized to access
	scopes []string
}

// Get a list of all clients, including basic information, but not credentials.
type ListClientsResponse struct {
}

// Representation of an indexed task.
type IndexedTaskResponse struct {
	// Data that was reported with the task. This is an arbitrary JSON object.
	data object
	// Date at which this entry expires from the task index.
	expires string
	// Namespace of the indexed task, used to find the indexed task in the index.
	namespace string
	// If multiple tasks are indexed with the same `namespace` the task with the
	// highest `rank` will be stored and returned in later requests. If two tasks
	// has the same `rank` the latest task will be stored.
	rank number
	// Unique task identifier, this is UUID encoded as
	// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
	// stripped of `=` padding.
	taskId string
}

// Representation of an a task to be indexed.
type InsertTaskRequest struct {
	// This is an arbitrary JSON object. Feel free to put whatever data you want
	// here, but do limit it, you'll get errors if you store more than 32KB.
	// So stay well, below that limit.
	data object
	// Date at which this entry expires from the task index.
	expires string
	// If multiple tasks are indexed with the same `namespace` the task with the
	// highest `rank` will be stored and returned in later requests. If two tasks
	// has the same `rank` the latest task will be stored.
	rank number
	// Unique task identifier, this is UUID encoded as
	// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
	// stripped of `=` padding.
	taskId string
}

// Request to list namespaces within a given namespace.
type ListNamespacesRequest struct {
	// A continuation token previously returned in a response to this list
	// request. This property is optional and should not be provided for first
	// requests.
	continuationToken string
	// Maximum number of results per page. If there are more results than this
	// a continuation token will be return.
	limit integer
}

// Response from a request to list namespaces within a given namespace.
type ListNamespacesResponse struct {
	// A continuation token is returned if there are more results than listed
	// here. You can optionally provide the token in the request payload to
	// load the additional results.
	continuationToken string
	// List of namespaces.
	namespaces []object
}

// Request to list tasks within a given namespace.
type ListTasksRequest struct {
	// A continuation token previously returned in a response to this list
	// request. This property is optional and should not be provided for first
	// requests.
	continuationToken string
	// Maximum number of results per page. If there are more results than this
	// a continuation token will be return.
	limit integer
}

// Representation of an indexed task.
type ListTasksResponse struct {
	// A continuation token is returned if there are more results than listed
	// here. You can optionally provide the token in the request payload to
	// load the additional results.
	continuationToken string
	// List of tasks.
	tasks []object
}

// Message reporting a new artifact has been created for a given task.
type ArtifactCreatedMessage struct {
	// Information about the artifact that was created
	artifact unknown
	// Id of the run on which artifact was created.
	runId  integer
	status unknown
	// Message version
	version unknown
	// Identifier for the worker-group within which the run with the created
	// artifacted is running.
	workerGroup string
	// Identifier for the worker within which the run with the created artifact
	// is running.
	workerId string
}

// Request to claim work
type WorkClaimRequest struct {
	// Identifier for group that worker claiming the task is a part of.
	workerGroup string
	// Identifier for worker within the given workerGroup
	workerId string
}

// Definition of a task that can be scheduled
type TaskDefinition struct {
	// Creation time of task
	created string
	// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline
	deadline string
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
	// Required task metadata
	metadata object
	// Task-specific payload following worker-specific format. For example the
	// `docker-worker` requires keys like: `image`, `commands` and
	// `features`. Refer to the documentation of `docker-worker` for details.
	payload object
	// Unique identifier for a provisioner, that can supply specified
	// `workerType`
	provisionerId string
	// Number of times to retry the task in case of infrastructure issues.
	// An _infrastructure issue_ is a worker node that crashes or is shutdown,
	// these events are to be expected.
	retries integer
	// List of task specific routes, AMQP messages will be CC'ed to these routes.
	routes []string
	// Identifier for the scheduler that _defined_ this task, this can be an
	// identifier for a user or a service like the `"task-graph-scheduler"`.
	// Along with the `taskGroupId` this is used to form the permission scope
	// `queue:assume:scheduler-id:<schedulerId>/<taskGroupId>`,
	// this scope is necessary to _schedule_ a defined task, or _rerun_ a task.
	schedulerId string
	// List of scopes (or scope-patterns) that the task is
	// authorized to use.
	scopes []string
	// Arbitrary key-value tags (only strings limited to 4k). These can be used
	// to attach informal meta-data to a task. Use this for informal tags that
	// tasks can be classified by. You can also think of strings here as
	// candidates for formal meta-data. Something like
	// `purpose: 'build' || 'test'` is a good example.
	tags object
	// Identifier for a group of tasks scheduled together with this task, by
	// scheduler identified by `schedulerId`. For tasks scheduled by the
	// task-graph scheduler, this is the `taskGraphId`.  Defaults to `taskId` if
	// property isn't specified.
	taskGroupId string
	// Unique identifier for a worker-type within a specific provisioner
	workerType string
}

// List of artifacts for a given `taskId` and `runId`.
type ListArtifactsResponse struct {
	// List of artifacts for given `taskId` and `runId`.
	artifacts array
}

// Response to request for poll task urls.
type PollTaskUrlsResponse struct {
	// Date and time after which the signed URLs provided in this response
	// expires and not longer works for authentication.
	expires string
	// List of signed URLs to poll tasks from, they must be called in the order
	// they are given. As the first entry in this array **may** have higher
	// priority.
	signedPollTaskUrls []string
}

// Request a authorization to put and artifact or posting of a URL as an artifact. Note that the `storageType` property is referenced in the response as well.
type PostArtifactRequest struct {
}

// Response to a request for posting an artifact. Note that the `storageType` property is referenced in the request as well.
type PostArtifactResponse struct {
}

// Request to claim (or reclaim) a task
type TaskClaimRequest struct {
	// MessageId from Azure Queue message
	messageId string
	// PopReceipt from Azure Queue message
	receipt string
	// Signature from the MessageText in Azure Queue message
	signature string
	// Identifier for group that worker claiming the task is a part of.
	workerGroup string
	// Identifier for worker within the given workerGroup
	workerId string
}

// Response to a successful task claim
type TaskClaimResponse struct {
	// `run-id` assigned to this run of the task
	runId  integer
	status unknown
	// Time at which the run expires and is resolved as `failed`, if the run isn't reclaimed.
	takenUntil string
	// Identifier for the worker-group within which this run started.
	workerGroup string
	// Identifier for the worker executing this run.
	workerId string
}

// Message reporting that a task has complete successfully.
type TaskCompletedMessage struct {
	// Id of the run that completed the task
	runId  integer
	status unknown
	// Message version
	version unknown
	// Identifier for the worker-group within which this run ran.
	workerGroup string
	// Identifier for the worker that executed this run.
	workerId string
}

// Request for a task to be declared completed
type TaskCompletedRequest struct {
	// True, if task is completed, and false if task is failed. This property
	// is optional and only present for backwards compatibility. It will be
	// removed in the future.
	success boolean
}

// Message reporting that a task has been defined. The task may or may not be
// _scheduled_ too.
type TaskDefinedMessage struct {
	status unknown
	// Message version
	version unknown
}

// Message reporting that TaskCluster have failed to run a task.
type TaskExceptionMessage struct {
	// Id of the last run for the task, not provided if `deadline`
	// was exceeded before a run was started.
	runId  integer
	status unknown
	// Message version
	version unknown
	// Identifier for the worker-group within which the last attempt of the task
	// ran. Not provided, if `deadline` was exceeded before a run was started.
	workerGroup string
	// Identifier for the last worker that failed to report, causing the task
	// to fail. Not provided, if `deadline` was exceeded before a run
	// was started.
	workerId string
}

// Request for a run of a task to be resolved with an exception
type TaskExceptionRequest struct {
	// Reason that the task is resolved with an exception. This is a subset
	// of the values for `resolvedReason` given in the task status structure.
	// Please, report `worker-shutdown` if the run failed because the worker
	// had to shutdown (spot node disappearing).
	// And report `malformed-payload` if the `task.payload` doesn't match the
	// schema for the worker payload, or referenced dependencies doesn't exists.
	// In either case, you should still log the error to a log file under the
	// specific run.
	reason unknown
}

// Message reporting that a task failed to complete successfully.
type TaskFailedMessage struct {
	// Id of the run that failed.
	runId  integer
	status unknown
	// Message version
	version unknown
	// Identifier for the worker-group within which this run ran.
	workerGroup string
	// Identifier for the worker that executed this run.
	workerId string
}

// Message reporting that a task is now pending
type TaskPendingMessage struct {
	// Id of run that became pending, `run-id`s always starts from 0
	runId  integer
	status unknown
	// Message version
	version unknown
}

// Message reporting that a given run of a task have started
type TaskRunningMessage struct {
	// Id of the run that just started, always starts from 0
	runId  integer
	status unknown
	// Time at which the run expires and is resolved as `failed`, if the run
	// isn't reclaimed.
	takenUntil string
	// Message version
	version unknown
	// Identifier for the worker-group within which this run started.
	workerGroup string
	// Identifier for the worker executing this run.
	workerId string
}

// Response to a task status request
type TaskStatusResponse struct {
	status unknown
}

// A representation of **task status** as known by the queue
type TaskStatusStructure struct {
	// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline
	deadline string
	// Unique identifier for the provisioner that this task must be scheduled on
	provisionerId string
	// Number of retries left for the task in case of infrastructure issues
	retriesLeft integer
	// List of runs, ordered so that index `i` has `runId == i`
	runs []object
	// Identifier for the scheduler that _defined_ this task.
	schedulerId string
	// State of this task. This is just an auxiliary property derived from state
	// of latests run, or `unscheduled` if none.
	state unknown
	// Identifier for a group of tasks scheduled together with this task, by
	// scheduler identified by `schedulerId`. For tasks scheduled by the
	// task-graph scheduler, this is the `taskGraphId`.
	taskGroupId string
	// Unique task identifier, this is UUID encoded as
	// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
	// stripped of `=` padding.
	taskId string
	// Identifier for worker type within the specified provisioner
	workerType string
}

// Definition of a task that can be scheduled
type TaskDefinition1 struct {
	// Creation time of task
	created string
	// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline
	deadline string
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
	// Required task metadata
	metadata object
	// Task-specific payload following worker-specific format. For example the
	// `docker-worker` requires keys like: `image`, `commands` and
	// `features`. Refer to the documentation of `docker-worker` for details.
	payload object
	// Unique identifier for a provisioner, that can supply specified
	// `workerType`
	provisionerId string
	// Number of times to retry the task in case of infrastructure issues.
	// An _infrastructure issue_ is a worker node that crashes or is shutdown,
	// these events are to be expected.
	retries integer
	// List of task specific routes, AMQP messages will be CC'ed to these routes.
	routes []string
	// Identifier for the scheduler that _defined_ this task, this can be an
	// identifier for a user or a service like the `"task-graph-scheduler"`.
	// Along with the `taskGroupId` this is used to form the permission scope
	// `queue:assume:scheduler-id:<schedulerId>/<taskGroupId>`,
	// this scope is necessary to _schedule_ a defined task, or _rerun_ a task.
	schedulerId string
	// List of scopes (or scope-patterns) that the task is
	// authorized to use.
	scopes []string
	// Arbitrary key-value tags (only strings limited to 4k). These can be used
	// to attach informal meta-data to a task. Use this for informal tags that
	// tasks can be classified by. You can also think of strings here as
	// candidates for formal meta-data. Something like
	// `purpose: 'build' || 'test'` is a good example.
	tags object
	// Identifier for a group of tasks scheduled together with this task, by
	// scheduler identified by `schedulerId`. For tasks scheduled by the
	// task-graph scheduler, this is the `taskGraphId`.  Defaults to `taskId` if
	// property isn't specified.
	taskGroupId string
	// Unique identifier for a worker-type within a specific provisioner
	workerType string
}

// Definition of a task-graph that can be scheduled
type TaskGraphDefinition struct {
	// List of nodes in the task-graph, each featuring a task definition and scheduling preferences, such as number of _reruns_ to attempt.
	tasks []object
}

// Information about a **task-graph** as known by the scheduler, with all the state of all individual tasks.
type InspectTaskGraphResponse struct {
	// Required task metadata
	metadata object
	status   unknown
	// Arbitrary key-value tags (only strings limited to 4k)
	tags object
	// Mapping from task-labels to task information and state.
	tasks []object
}

// Information about a **task** in a task-graph as known by the scheduler.
type InspectTaskGraphTaskResponse struct {
	// List of `taskId`s that requires this task to be _complete successfully_ before they can be scheduled.
	dependents []string
	// Human readable name from the task definition
	name string
	// List of required `taskId`s
	requires []string
	// List of `taskId`s that have yet to complete successfully, before this task can be scheduled.
	requiresLeft []string
	// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
	reruns integer
	// Number of reruns that haven't been used yet.
	rerunsLeft integer
	// true, if the scheduler considers the task node as satisfied and hence no-longer prevents dependent tasks from running.
	satisfied boolean
	// State of the task as considered by the scheduler
	state unknown
	// Unique task identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
	taskId string
}

// Message that all reruns of a task has failed it is now blocking the task-graph from finishing.
type BlockedTaskGraphMessage struct {
	status unknown
	// Unique `taskId` that is blocking this task-graph from completion.
	taskId string
	// Message version
	version unknown
}

// Messages as posted to `scheduler/v1/task-graph-extended` informing the world that a task-graph have been extended.
type TaskGraphExtendedMessage struct {
	status unknown
	// Message version
	version unknown
}

// Message that all tasks in a task-graph have now completed successfully and the graph is _finished_.
type TaskGraphFinishedMessage struct {
	status unknown
	// Message version
	version unknown
}

// Response for a request for task-graph information
type TaskGraphInfoResponse struct {
	// Required task metadata
	metadata object
	status   unknown
	// Arbitrary key-value tags (only strings limited to 4k)
	tags object
}

// Messages as posted to `scheduler/v1/task-graph-running` informing the world that a new task-graph have been submitted.
type NewTaskGraphMessage struct {
	status unknown
	// Message version
	version unknown
}

// Response containing the status structure for a task-graph
type TaskGraphStatusResponse struct {
	status unknown
}

// Response containing the status structure for a task-graph
type TaskGraphStatusResponse1 struct {
	status unknown
}

// A representation of **task-graph status** as known by the scheduler, without the state of all individual tasks.
type TaskGraphStatusStructure struct {
	// Unique identifier for task-graph scheduler managing the given task-graph
	schedulerId string
	// Task-graph state, this enum is **frozen** new values will **not** be added.
	state unknown
	// Unique task-graph identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
	taskGraphId string
}

// Definition of a task-graph that can be scheduled
type TaskGraphDefinition1 struct {
	// Required task metadata"
	metadata object
	// List of task-graph specific routes, AMQP messages will be CC'ed to these
	// routes prefixed by `'route.'`.
	routes []string
	// List of scopes (or scope-patterns) that tasks of the task-graph is
	// authorized to use.
	scopes []string
	// Arbitrary key-value tags (only strings limited to 4k)
	tags object
	// List of nodes in the task-graph, each featuring a task definition and scheduling preferences, such as number of _reruns_ to attempt.
	tasks []object
}
