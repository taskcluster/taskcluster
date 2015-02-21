// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the client subdirectory:
//
// go generate && go fmt

package client

import "net/http"

type (
	// Response to a request for an Shared-Access-Signature to access and Azure
	// Table Storage table.
	//
	// See http://schemas.taskcluster.net/auth/v1/azure-table-access-response.json#
	AzureSharedAccessSignatureResponse struct {
		// Date and time of when the Shared-Access-Signature expires.
		Expiry string `json:"expiry"`
		// Shared-Access-Signature string. This is the querystring parameters to
		// be appened after `?` or `&` depending on whether or not a querystring is
		// already present in the URL.
		Sas string `json:"sas"`
	}

	// Credentials, scopes and expiration date for a client
	//
	// See http://schemas.taskcluster.net/auth/v1/client-credentials-response.json#
	GetClientCredentialsResponse struct {
		// AccessToken used for authenticating requests
		AccessToken string `json:"accessToken"`
		// ClientId of the client scopes is requested about
		ClientId string `json:"clientId"`
		// Date and time where the clients credentials are set to expire
		Expires string `json:"expires"`
		// List of scopes the client is authorized to access
		Scopes []string `json:"scopes"`
	}

	// Scopes and expiration date for a client
	//
	// See http://schemas.taskcluster.net/auth/v1/client-scopes-response.json#
	GetClientScopesResponse struct {
		// ClientId of the client scopes is requested about
		ClientId string `json:"clientId"`
		// Date and time where the clients credentials are set to expire
		Expires string `json:"expires"`
		// List of scopes the client is authorized to access
		Scopes []string `json:"scopes"`
	}

	// Credentials, scopes and expiration date for a client
	//
	// See http://schemas.taskcluster.net/auth/v1/create-client-request.json#
	GetClientCredentialsResponse1 struct {
		// Description of what these credentials are used for in markdown.
		// Please write a few details here, including who is the owner, point of
		// contact. Why it is scoped as is, think of this as documentation.
		Description string `json:"description"`
		// Date and time where the clients credentials are set to expire
		Expires string `json:"expires"`
		// Human readable name of this set of credentials, typical
		// component/server-name or IRC nickname of the user.
		Name string `json:"name"`
		// List of scopes the client is authorized to access
		Scopes []string `json:"scopes"`
	}

	// Get all detaisl about a client, useful for tools modifying a client
	//
	// See http://schemas.taskcluster.net/auth/v1/get-client-response.json#
	GetClientResponse struct {
		// AccessToken used for authenticating requests
		AccessToken string `json:"accessToken"`
		// ClientId of the client scopes is requested about
		ClientId string `json:"clientId"`
		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		// Why it is scoped as is, think of this as documentation.
		Description string `json:"description"`
		// Date and time where the clients credentials are set to expire
		Expires string `json:"expires"`
		// Human readable name of this set of credentials, typical
		// component/server-name or IRC nickname of the user.
		Name string `json:"name"`
		// List of scopes the client is authorized to access
		Scopes []string `json:"scopes"`
	}

	// Get a list of all clients, including basic information, but not credentials.
	//
	// See http://schemas.taskcluster.net/auth/v1/list-clients-response.json#
	ListClientsResponse []struct {
		// ClientId of the client scopes is requested about
		ClientId string `json:"clientId"`
		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		// Why it is scoped as is, think of this as documentation.
		Description string `json:"description"`
		// Date and time where the clients credentials are set to expire
		Expires string `json:"expires"`
		// Human readable name of this set of credentials, typical
		// component/server-name or IRC nickname of the user.
		Name string `json:"name"`
		// List of scopes the client is authorized to access
		Scopes []string `json:"scopes"`
	}

	// Representation of an indexed task.
	//
	// See http://schemas.taskcluster.net/index/v1/indexed-task-response.json#
	IndexedTaskResponse struct {
		// Data that was reported with the task. This is an arbitrary JSON object.
		Data interface{} `json:"data"`
		// Date at which this entry expires from the task index.
		Expires string `json:"expires"`
		// Namespace of the indexed task, used to find the indexed task in the index.
		Namespace string `json:"namespace"`
		// If multiple tasks are indexed with the same `namespace` the task with the
		// highest `rank` will be stored and returned in later requests. If two tasks
		// has the same `rank` the latest task will be stored.
		Rank int `json:"rank"`
		// Unique task identifier, this is UUID encoded as
		// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
		// stripped of `=` padding.
		TaskId string `json:"taskId"`
	}

	// Representation of an a task to be indexed.
	//
	// See http://schemas.taskcluster.net/index/v1/insert-task-request.json#
	InsertTaskRequest struct {
		// This is an arbitrary JSON object. Feel free to put whatever data you want
		// here, but do limit it, you'll get errors if you store more than 32KB.
		// So stay well, below that limit.
		Data interface{} `json:"data"`
		// Date at which this entry expires from the task index.
		Expires string `json:"expires"`
		// If multiple tasks are indexed with the same `namespace` the task with the
		// highest `rank` will be stored and returned in later requests. If two tasks
		// has the same `rank` the latest task will be stored.
		Rank int `json:"rank"`
		// Unique task identifier, this is UUID encoded as
		// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
		// stripped of `=` padding.
		TaskId string `json:"taskId"`
	}

	// Request to list namespaces within a given namespace.
	//
	// See http://schemas.taskcluster.net/index/v1/list-namespaces-request.json#
	ListNamespacesRequest struct {
		// A continuation token previously returned in a response to this list
		// request. This property is optional and should not be provided for first
		// requests.
		ContinuationToken string `json:"continuationToken"`
		// Maximum number of results per page. If there are more results than this
		// a continuation token will be return.
		Limit int `json:"limit"`
	}

	// Response from a request to list namespaces within a given namespace.
	//
	// See http://schemas.taskcluster.net/index/v1/list-namespaces-response.json#
	ListNamespacesResponse struct {
		// A continuation token is returned if there are more results than listed
		// here. You can optionally provide the token in the request payload to
		// load the additional results.
		ContinuationToken string `json:"continuationToken"`
		// List of namespaces.
		Namespaces []struct {
			// Date at which this entry, and by implication all entries below it,
			// expires from the task index.
			Expires string `json:"expires"`
			// Name of namespace within it's parent namespace.
			Name interface{} `json:"name"`
			// Fully qualified name of the namespace, you can use this to list
			// namespaces or tasks under this namespace.
			Namespace string `json:"namespace"`
		} `json:"namespaces"`
	}

	// Request to list tasks within a given namespace.
	//
	// See http://schemas.taskcluster.net/index/v1/list-tasks-request.json#
	ListTasksRequest struct {
		// A continuation token previously returned in a response to this list
		// request. This property is optional and should not be provided for first
		// requests.
		ContinuationToken string `json:"continuationToken"`
		// Maximum number of results per page. If there are more results than this
		// a continuation token will be return.
		Limit int `json:"limit"`
	}

	// Representation of an indexed task.
	//
	// See http://schemas.taskcluster.net/index/v1/list-tasks-response.json#
	ListTasksResponse struct {
		// A continuation token is returned if there are more results than listed
		// here. You can optionally provide the token in the request payload to
		// load the additional results.
		ContinuationToken string `json:"continuationToken"`
		// List of tasks.
		Tasks []struct {
			// Data that was reported with the task. This is an arbitrary JSON
			// object.
			Data interface{} `json:"data"`
			// Date at which this entry expires from the task index.
			Expires string `json:"expires"`
			// Namespace of the indexed task, used to find the indexed task in the
			// index.
			Namespace string `json:"namespace"`
			// If multiple tasks are indexed with the same `namespace` the task
			// with the highest `rank` will be stored and returned in later
			// requests. If two tasks has the same `rank` the latest task will be
			// stored.
			Rank int `json:"rank"`
			// Unique task identifier, this is UUID encoded as
			// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
			// stripped of `=` padding.
			TaskId string `json:"taskId"`
		} `json:"tasks"`
	}

	// Message reporting a new artifact has been created for a given task.
	//
	// See http://schemas.taskcluster.net/queue/v1/artifact-created-message.json#
	ArtifactCreatedMessage struct {
		// Information about the artifact that was created
		Artifact interface{} `json:"artifact"`
		// Id of the run on which artifact was created.
		RunId  int                 `json:"runId"`
		Status TaskStatusStructure `json:"status"`
		// Message version
		Version interface{} `json:"version"`
		// Identifier for the worker-group within which the run with the created
		// artifacted is running.
		WorkerGroup string `json:"workerGroup"`
		// Identifier for the worker within which the run with the created artifact
		// is running.
		WorkerId string `json:"workerId"`
	}

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

	// Message reporting that a task has complete successfully.
	//
	// See http://schemas.taskcluster.net/queue/v1/task-completed-message.json#
	TaskCompletedMessage struct {
		// Id of the run that completed the task
		RunId  int                 `json:"runId"`
		Status TaskStatusStructure `json:"status"`
		// Message version
		Version interface{} `json:"version"`
		// Identifier for the worker-group within which this run ran.
		WorkerGroup string `json:"workerGroup"`
		// Identifier for the worker that executed this run.
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

	// Message reporting that a task has been defined. The task may or may not be
	// _scheduled_ too.
	//
	// See http://schemas.taskcluster.net/queue/v1/task-defined-message.json#
	TaskDefinedMessage struct {
		Status TaskStatusStructure `json:"status"`
		// Message version
		Version interface{} `json:"version"`
	}

	// Message reporting that TaskCluster have failed to run a task.
	//
	// See http://schemas.taskcluster.net/queue/v1/task-exception-message.json#
	TaskExceptionMessage struct {
		// Id of the last run for the task, not provided if `deadline`
		// was exceeded before a run was started.
		RunId  int                 `json:"runId"`
		Status TaskStatusStructure `json:"status"`
		// Message version
		Version interface{} `json:"version"`
		// Identifier for the worker-group within which the last attempt of the task
		// ran. Not provided, if `deadline` was exceeded before a run was started.
		WorkerGroup string `json:"workerGroup"`
		// Identifier for the last worker that failed to report, causing the task
		// to fail. Not provided, if `deadline` was exceeded before a run
		// was started.
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
		Reason interface{} `json:"reason"`
	}

	// Message reporting that a task failed to complete successfully.
	//
	// See http://schemas.taskcluster.net/queue/v1/task-failed-message.json#
	TaskFailedMessage struct {
		// Id of the run that failed.
		RunId  int                 `json:"runId"`
		Status TaskStatusStructure `json:"status"`
		// Message version
		Version interface{} `json:"version"`
		// Identifier for the worker-group within which this run ran.
		WorkerGroup string `json:"workerGroup"`
		// Identifier for the worker that executed this run.
		WorkerId string `json:"workerId"`
	}

	// Message reporting that a task is now pending
	//
	// See http://schemas.taskcluster.net/queue/v1/task-pending-message.json#
	TaskPendingMessage struct {
		// Id of run that became pending, `run-id`s always starts from 0
		RunId  int                 `json:"runId"`
		Status TaskStatusStructure `json:"status"`
		// Message version
		Version interface{} `json:"version"`
	}

	// Message reporting that a given run of a task have started
	//
	// See http://schemas.taskcluster.net/queue/v1/task-running-message.json#
	TaskRunningMessage struct {
		// Id of the run that just started, always starts from 0
		RunId  int                 `json:"runId"`
		Status TaskStatusStructure `json:"status"`
		// Time at which the run expires and is resolved as `failed`, if the run
		// isn't reclaimed.
		TakenUntil string `json:"takenUntil"`
		// Message version
		Version interface{} `json:"version"`
		// Identifier for the worker-group within which this run started.
		WorkerGroup string `json:"workerGroup"`
		// Identifier for the worker executing this run.
		WorkerId string `json:"workerId"`
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

	// Message that all reruns of a task has failed it is now blocking the task-graph from finishing.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-blocked-message.json#
	BlockedTaskGraphMessage struct {
		Status TaskGraphStatusStructure `json:"status"`
		// Unique `taskId` that is blocking this task-graph from completion.
		TaskId string `json:"taskId"`
		// Message version
		Version interface{} `json:"version"`
	}

	// Messages as posted to `scheduler/v1/task-graph-extended` informing the world that a task-graph have been extended.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-extended-message.json#
	TaskGraphExtendedMessage struct {
		Status TaskGraphStatusStructure `json:"status"`
		// Message version
		Version interface{} `json:"version"`
	}

	// Message that all tasks in a task-graph have now completed successfully and the graph is _finished_.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-finished-message.json#
	TaskGraphFinishedMessage struct {
		Status TaskGraphStatusStructure `json:"status"`
		// Message version
		Version interface{} `json:"version"`
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

	// Messages as posted to `scheduler/v1/task-graph-running` informing the world that a new task-graph have been submitted.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-running-message.json#
	NewTaskGraphMessage struct {
		Status TaskGraphStatusStructure `json:"status"`
		// Message version
		Version interface{} `json:"version"`
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

// Authentication related API end-points for taskcluster.
//
// See: http://references.taskcluster.net/auth/v1/api.json
type AuthAPI struct {
	Auth
}

// Returns a pointer to AuthAPI, configured to run against production.
// If you wish to point at a different API endpoint url, set the BaseURL struct
// member to your chosen location. You may also disable authentication (for
// example if you wish to use the taskcluster-proxy) by setting Authenticate
// struct member to false.
//
// For example:
//  authAPI := client.NewAuthAPI("123", "456")                 // set clientId and accessToken
//  authAPI.Authenticate = false                               // disable authentication (true by default)
//  authAPI.BaseURL = "http://localhost:1234/api/AuthAPI/v1"   // alternative API endpoint (production by default)
// data, httpResponse := authAPI.Scopes(.....)                // for example, call the Scopes(.....) API endpoint (described further down)...
func NewAuthAPI(clientId string, accessToken string) *AuthAPI {
	r := &AuthAPI{}
	r.ClientId = clientId
	r.AccessToken = accessToken
	r.BaseURL = "https://auth.taskcluster.net/v1"
	r.Authenticate = true
	return r
}

// Returns the scopes the client is authorized to access and the date-time
// where the clients authorization is set to expire.
//
// This API end-point allows you inspect clients without getting access to
// credentials, as provide by the `getCredentials` request below.
//
// See http://docs.taskcluster.net/auth/api-docs/#scopes
func (a *AuthAPI) Scopes(clientId string) (*GetClientScopesResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/client/"+clientId+"/scopes", new(GetClientScopesResponse))
	return responseObject.(*GetClientScopesResponse), httpResponse
}

// Returns the clients `accessToken` as needed for verifying signatures.
// This API end-point also returns the list of scopes the client is
// authorized for and the date-time where the client authorization expires
//
// Remark, **if you don't need** the `accessToken` but only want to see what
// scopes a client is authorized for, you should use the `getScopes`
// function described above.
//
// See http://docs.taskcluster.net/auth/api-docs/#getCredentials
func (a *AuthAPI) GetCredentials(clientId string) (*GetClientCredentialsResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/client/"+clientId+"/credentials", new(GetClientCredentialsResponse))
	return responseObject.(*GetClientCredentialsResponse), httpResponse
}

// Returns all information about a given client. This end-point is mostly
// building tools to administrate clients. Do not use if you only want to
// authenticate a request, see `getCredentials` for this purpose.
//
// See http://docs.taskcluster.net/auth/api-docs/#client
func (a *AuthAPI) Client(clientId string) (*GetClientResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/client/"+clientId+"", new(GetClientResponse))
	return responseObject.(*GetClientResponse), httpResponse
}

// Create client with given `clientId`, `name`, `expires`, `scopes` and
// `description`. The `accessToken` will always be generated server-side,
// and will be returned from this request.
//
// **Required scopes**, in addition the scopes listed
// above, the caller must also posses the all the scopes that is given to
// the client that is created.
//
// See http://docs.taskcluster.net/auth/api-docs/#createClient
func (a *AuthAPI) CreateClient(clientId string, payload *GetClientCredentialsResponse1) (*GetClientResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "PUT", "/client/"+clientId+"", new(GetClientResponse))
	return responseObject.(*GetClientResponse), httpResponse
}

// Modify client `name`, `expires`, `scopes` and
// `description`.
//
// **Required scopes**, in addition the scopes listed
// above, the caller must also posses the all the scopes that is given to
// the client that is updated.
//
// See http://docs.taskcluster.net/auth/api-docs/#modifyClient
func (a *AuthAPI) ModifyClient(clientId string, payload *GetClientCredentialsResponse1) (*GetClientResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/client/"+clientId+"/modify", new(GetClientResponse))
	return responseObject.(*GetClientResponse), httpResponse
}

// Delete a client with given `clientId`.
//
// See http://docs.taskcluster.net/auth/api-docs/#removeClient
func (a *AuthAPI) RemoveClient(clientId string) *http.Response {
	_, httpResponse := a.apiCall(nil, "DELETE", "/client/"+clientId+"", nil)
	return httpResponse
}

// Reset credentials for a client. This will generate a new `accessToken`.
// as always the `accessToken` will be generated server-side and returned.
//
// See http://docs.taskcluster.net/auth/api-docs/#resetCredentials
func (a *AuthAPI) ResetCredentials(clientId string) (*GetClientResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "POST", "/client/"+clientId+"/reset-credentials", new(GetClientResponse))
	return responseObject.(*GetClientResponse), httpResponse
}

// Return list with all clients
//
// See http://docs.taskcluster.net/auth/api-docs/#listClients
func (a *AuthAPI) ListClients() (*ListClientsResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/list-clients", new(ListClientsResponse))
	return responseObject.(*ListClientsResponse), httpResponse
}

// Get an SAS string for use with a specific Azure Table Storage table.
// Note, this will create the table, if it doesn't already exists.
//
// See http://docs.taskcluster.net/auth/api-docs/#azureTableSAS
func (a *AuthAPI) AzureTableSAS(account string, table string) (*AzureSharedAccessSignatureResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/azure/"+account+"/table/"+table+"/read-write", new(AzureSharedAccessSignatureResponse))
	return responseObject.(*AzureSharedAccessSignatureResponse), httpResponse
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/auth/api-docs/#ping
func (a *AuthAPI) Ping() *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/ping", nil)
	return httpResponse
}

// The task index, typically available at `index.taskcluster.net`, is
// responsible for indexing tasks. In order to ensure that tasks can be
// located by recency and/or arbitrary strings. Common use-cases includes
//
//  * Locate tasks by git or mercurial `<revision>`, or
//  * Locate latest task from given `<branch>`, such as a release.
//
// **Index hierarchy**, tasks are indexed in a dot `.` separated hierarchy
// called a namespace. For example a task could be indexed in
// `<revision>.linux-64.release-build`. In this case the following
// namespaces is created.
//
//  1. `<revision>`, and,
//  2. `<revision>.linux-64`
//
// The inside the namespace `<revision>` you can find the namespace
// `<revision>.linux-64` inside which you can find the indexed task
// `<revision>.linux-64.release-build`. In this example you'll be able to
// find build for a given revision.
//
// **Task Rank**, when a task is indexed, it is assigned a `rank` (defaults
// to `0`). If another task is already indexed in the same namespace with
// the same lower or equal `rank`, the task will be overwritten. For example
// consider a task indexed as `mozilla-central.linux-64.release-build`, in
// this case on might choose to use a unix timestamp or mercurial revision
// number as `rank`. This way the latest completed linux 64 bit release
// build is always available at `mozilla-central.linux-64.release-build`.
//
// **Indexed Data**, when a task is located in the index you will get the
// `taskId` and an additional user-defined JSON blob that was indexed with
// task. You can use this to store additional information you would like to
// get additional from the index.
//
// **Entry Expiration**, all indexed entries must have an expiration date.
// Typically this defaults to one year, if not specified. If you are
// indexing tasks to make it easy to find artifacts, consider using the
// expiration date that the artifacts is assigned.
//
// **Indexing Routes**, tasks can be indexed using the API below, but the
// most common way to index tasks is adding a custom route on the following
// form `index.<namespace>`. In-order to add this route to a task you'll
// need the following scope `queue:route:index.<namespace>`. When a task has
// this route, it'll be indexed when the task is **completed successfully**.
// The task will be indexed with `rank`, `data` and `expires` as specified
// in `task.extra.index`, see example below:
//
// ```js
// {
//   payload:  { /* ... */ },
//   routes: [
//     // index.<namespace> prefixed routes, tasks CC'ed such a route will
//     // be indexed under the given <namespace>
//     "index.mozilla-central.linux-64.release-build",
//     "index.<revision>.linux-64.release-build"
//   ],
//   extra: {
//     // Optional details for indexing service
//     index: {
//       // Ordering, this taskId will overwrite any thing that has
//       // rank <= 4000 (defaults to zero)
//       rank:       4000,
//
//       // Specify when the entries expires (Defaults to 1 year)
//       expires:          new Date().toJSON(),
//
//       // A little informal data to store along with taskId
//       // (less 16 kb when encoded as JSON)
//       data: {
//         hgRevision:   "...",
//         commitMessae: "...",
//         whatever...
//       }
//     },
//     // Extra properties for other services...
//   }
//   // Other task properties...
// }
// ```
//
// **Remark**, when indexing tasks using custom routes, it's also possible
// to listen for messages about these tasks. Which is quite convenient, for
// example one could bind to `route.index.mozilla-central.*.release-build`,
// and pick up all messages about release builds. Hence, it is a
// good idea to document task index hierarchies, as these make up extension
// points in their own.
//
// See: http://references.taskcluster.net/index/v1/api.json
type IndexAPI struct {
	Auth
}

// Returns a pointer to IndexAPI, configured to run against production.
// If you wish to point at a different API endpoint url, set the BaseURL struct
// member to your chosen location. You may also disable authentication (for
// example if you wish to use the taskcluster-proxy) by setting Authenticate
// struct member to false.
//
// For example:
//  indexAPI := client.NewIndexAPI("123", "456")                 // set clientId and accessToken
//  indexAPI.Authenticate = false                                // disable authentication (true by default)
//  indexAPI.BaseURL = "http://localhost:1234/api/IndexAPI/v1"   // alternative API endpoint (production by default)
// data, httpResponse := indexAPI.FindTask(.....)               // for example, call the FindTask(.....) API endpoint (described further down)...
func NewIndexAPI(clientId string, accessToken string) *IndexAPI {
	r := &IndexAPI{}
	r.ClientId = clientId
	r.AccessToken = accessToken
	r.BaseURL = "https://index.taskcluster.net/v1"
	r.Authenticate = true
	return r
}

// Find task by namespace, if no task existing for the given namespace, this
// API end-point respond `404`.
//
// See http://docs.taskcluster.net/services/index/#findTask
func (a *IndexAPI) FindTask(namespace string) (*IndexedTaskResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/task/"+namespace+"", new(IndexedTaskResponse))
	return responseObject.(*IndexedTaskResponse), httpResponse
}

// List the namespaces immediately under a given namespace. This end-point
// list up to 1000 namespaces. If more namespaces are present a
// `continuationToken` will be returned, which can be given in the next
// request. For the initial request, the payload should be an empty JSON
// object.
//
// **Remark**, this end-point is designed for humans browsing for tasks, not
// services, as that makes little sense.
//
// See http://docs.taskcluster.net/services/index/#listNamespaces
func (a *IndexAPI) ListNamespaces(namespace string, payload *ListNamespacesRequest) (*ListNamespacesResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/namespaces/"+namespace+"", new(ListNamespacesResponse))
	return responseObject.(*ListNamespacesResponse), httpResponse
}

// List the tasks immediately under a given namespace. This end-point
// list up to 1000 tasks. If more tasks are present a
// `continuationToken` will be returned, which can be given in the next
// request. For the initial request, the payload should be an empty JSON
// object.
//
// **Remark**, this end-point is designed for humans browsing for tasks, not
// services, as that makes little sense.
//
// See http://docs.taskcluster.net/services/index/#listTasks
func (a *IndexAPI) ListTasks(namespace string, payload *ListTasksRequest) (*ListTasksResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/tasks/"+namespace+"", new(ListTasksResponse))
	return responseObject.(*ListTasksResponse), httpResponse
}

// Insert a task into the index. Please see the introduction above, for how
// to index successfully completed tasks automatically, using custom routes.
//
// See http://docs.taskcluster.net/services/index/#insertTask
func (a *IndexAPI) InsertTask(namespace string, payload *InsertTaskRequest) (*IndexedTaskResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "PUT", "/task/"+namespace+"", new(IndexedTaskResponse))
	return responseObject.(*IndexedTaskResponse), httpResponse
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/services/index/#ping
func (a *IndexAPI) Ping() *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/ping", nil)
	return httpResponse
}

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
// See: http://references.taskcluster.net/queue/v1/api.json
type QueueAPI struct {
	Auth
}

// Returns a pointer to QueueAPI, configured to run against production.
// If you wish to point at a different API endpoint url, set the BaseURL struct
// member to your chosen location. You may also disable authentication (for
// example if you wish to use the taskcluster-proxy) by setting Authenticate
// struct member to false.
//
// For example:
//  queueAPI := client.NewQueueAPI("123", "456")                 // set clientId and accessToken
//  queueAPI.Authenticate = false                                // disable authentication (true by default)
//  queueAPI.BaseURL = "http://localhost:1234/api/QueueAPI/v1"   // alternative API endpoint (production by default)
// data, httpResponse := queueAPI.CreateTask(.....)             // for example, call the CreateTask(.....) API endpoint (described further down)...
func NewQueueAPI(clientId string, accessToken string) *QueueAPI {
	r := &QueueAPI{}
	r.ClientId = clientId
	r.AccessToken = accessToken
	r.BaseURL = "https://queue.taskcluster.net/v1"
	r.Authenticate = true
	return r
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
func (a *QueueAPI) CreateTask(taskId string, payload *TaskDefinition) (*TaskStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "PUT", "/task/"+taskId+"", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), httpResponse
}

// Get task definition from queue.
//
// See http://docs.taskcluster.net/queue/api-docs/#getTask
func (a *QueueAPI) GetTask(taskId string) (*TaskDefinition1, *http.Response) {
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
func (a *QueueAPI) DefineTask(taskId string, payload *TaskDefinition) (*TaskStatusResponse, *http.Response) {
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
func (a *QueueAPI) ScheduleTask(taskId string) (*TaskStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "POST", "/task/"+taskId+"/schedule", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), httpResponse
}

// Get task status structure from `taskId`
//
// See http://docs.taskcluster.net/queue/api-docs/#status
func (a *QueueAPI) Status(taskId string) (*TaskStatusResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/task/"+taskId+"/status", new(TaskStatusResponse))
	return responseObject.(*TaskStatusResponse), httpResponse
}

// Get a signed url to get a message from azure queue.
// Once messages are polled from here, you can claim the referenced task
// with `claimTask`.
//
// See http://docs.taskcluster.net/queue/api-docs/#pollTaskUrls
func (a *QueueAPI) PollTaskUrls(provisionerId string, workerType string) (*PollTaskUrlsResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/poll-task-url/"+provisionerId+"/"+workerType+"", new(PollTaskUrlsResponse))
	return responseObject.(*PollTaskUrlsResponse), httpResponse
}

// claim a task, more to be added later...
//
// **Warning,** in the future this API end-point will require the presents
// of `receipt`, `messageId` and `token` in the body.
//
// See http://docs.taskcluster.net/queue/api-docs/#claimTask
func (a *QueueAPI) ClaimTask(taskId string, runId string, payload *TaskClaimRequest) (*TaskClaimResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/task/"+taskId+"/runs/"+runId+"/claim", new(TaskClaimResponse))
	return responseObject.(*TaskClaimResponse), httpResponse
}

// reclaim a task more to be added later...
//
// See http://docs.taskcluster.net/queue/api-docs/#reclaimTask
func (a *QueueAPI) ReclaimTask(taskId string, runId string) (*TaskClaimResponse, *http.Response) {
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
func (a *QueueAPI) ClaimWork(provisionerId string, workerType string, payload *WorkClaimRequest) (*TaskClaimResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/claim-work/"+provisionerId+"/"+workerType+"", new(TaskClaimResponse))
	return responseObject.(*TaskClaimResponse), httpResponse
}

// Report a task completed, resolving the run as `completed`.
//
// For legacy, reasons the `success` parameter is accepted. This will be
// removed in the future.
//
// See http://docs.taskcluster.net/queue/api-docs/#reportCompleted
func (a *QueueAPI) ReportCompleted(taskId string, runId string, payload *TaskCompletedRequest) (*TaskStatusResponse, *http.Response) {
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
func (a *QueueAPI) ReportFailed(taskId string, runId string) (*TaskStatusResponse, *http.Response) {
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
func (a *QueueAPI) ReportException(taskId string, runId string, payload *TaskExceptionRequest) (*TaskStatusResponse, *http.Response) {
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
func (a *QueueAPI) RerunTask(taskId string) (*TaskStatusResponse, *http.Response) {
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
func (a *QueueAPI) CreateArtifact(taskId string, runId string, name string, payload *PostArtifactRequest) (*PostArtifactResponse, *http.Response) {
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
func (a *QueueAPI) GetArtifact(taskId string, runId string, name string) *http.Response {
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
func (a *QueueAPI) GetLatestArtifact(taskId string, name string) *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/task/"+taskId+"/artifacts/"+name+"", nil)
	return httpResponse
}

// Returns a list of artifacts and associated meta-data for a given run.
//
// See http://docs.taskcluster.net/queue/api-docs/#listArtifacts
func (a *QueueAPI) ListArtifacts(taskId string, runId string) (*ListArtifactsResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/task/"+taskId+"/runs/"+runId+"/artifacts", new(ListArtifactsResponse))
	return responseObject.(*ListArtifactsResponse), httpResponse
}

// Returns a list of artifacts and associated meta-data for the latest run
// from the given task.
//
// See http://docs.taskcluster.net/queue/api-docs/#listLatestArtifacts
func (a *QueueAPI) ListLatestArtifacts(taskId string) (*ListArtifactsResponse, *http.Response) {
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
func (a *QueueAPI) GetPendingTasks(provisionerId string) *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/pending-tasks/"+provisionerId+"", nil)
	return httpResponse
}

// Documented later...
//
// **Warning: This is an experimental end-point!**
//
// See http://docs.taskcluster.net/queue/api-docs/#pendingTaskCount
func (a *QueueAPI) PendingTaskCount(provisionerId string) *http.Response {
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
func (a *QueueAPI) PendingTasks(provisionerId string, workerType string) *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/pending/"+provisionerId+"/"+workerType+"", nil)
	return httpResponse
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/queue/api-docs/#ping
func (a *QueueAPI) Ping() *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/ping", nil)
	return httpResponse
}

// The queue, typically available at `queue.taskcluster.net`, is responsible
// for accepting tasks and track their state as they are executed by
// workers. In order ensure they are eventually resolved.
//
// This document describes AMQP exchanges offered by the queue, which allows
// third-party listeners to monitor tasks as they progress to resolution.
// These exchanges targets the following audience:
//  * Schedulers, who takes action after tasks are completed,
//  * Workers, who wants to listen for new or canceled tasks (optional),
//  * Tools, that wants to update their view as task progress.
//
// You'll notice that all the exchanges in the document shares the same
// routing key pattern. This makes it very easy to bind to all messages
// about a certain kind tasks.
//
// **Task-graphs**, if the task-graph scheduler, documented elsewhere, is
// used to schedule a task-graph, the task submitted will have their
// `schedulerId` set to `'task-graph-scheduler'`, and their `taskGroupId` to
// the `taskGraphId` as given to the task-graph scheduler. This is useful if
// you wish to listen for all messages in a specific task-graph.
//
// **Task specific routes**, a task can define a task specific route using
// the `task.routes` property. See task creation documentation for details
// on permissions required to provide task specific routes. If a task has
// the entry `'notify.by-email'` in as task specific route defined in
// `task.routes` all messages about this task will be CC'ed with the
// routing-key `'route.notify.by-email'`.
//
// These routes will always be prefixed `route.`, so that cannot interfere
// with the _primary_ routing key as documented here. Notice that the
// _primary_ routing key is alwasys prefixed `primary.`. This is ensured
// in the routing key reference, so API clients will do this automatically.
//
// Please, note that the way RabbitMQ works, the message will only arrive
// in your queue once, even though you may have bound to the exchange with
// multiple routing key patterns that matches more of the CC'ed routing
// routing keys.
//
// **Delivery guarantees**, most operations on the queue are idempotent,
// which means that if repeated with the same arguments then the requests
// will ensure completion of the operation and return the same response.
// This is useful if the server crashes or the TCP connection breaks, but
// when re-executing an idempotent operation, the queue will also resend
// any related AMQP messages. Hence, messages may be repeated.
//
// This shouldn't be much of a problem, as the best you can achieve using
// confirm messages with AMQP is at-least-once delivery semantics. Hence,
// this only prevents you from obtaining at-most-once delivery semantics.
//
// **Remark**, some message generated by timeouts maybe dropped if the
// server crashes at wrong time. Ideally, we'll address this in the
// future. For now we suggest you ignore this corner case, and notify us
// if this corner case is of concern to you.
type QueueExchanges struct {
}

// When a task is created or just defined a message is posted to this
// exchange.
//
// This message exchange is mainly useful when tasks are scheduled by a
// scheduler that uses `defineTask` as this does not make the task
// `pending`. Thus, no `taskPending` message is published.
// Please, note that messages are also published on this exchange if defined
// using `createTask`.
//
// See http://docs.taskcluster.net/queue/exchanges/#taskDefined
type TaskDefined struct {
	RoutingKeyKind string `mwords:"*"`
	TaskId         string `mwords:"*"`
	RunId          string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerId       string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	SchedulerId    string `mwords:"*"`
	TaskGroupId    string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (x TaskDefined) RoutingKey() string {
	return generateRoutingKey(&x)
}

func (x TaskDefined) ExchangeName() string {
	return "task-defined"
}

// When a task becomes `pending` a message is posted to this exchange.
//
// This is useful for workers who doesn't want to constantly poll the queue
// for new tasks. The queue will also be authority for task states and
// claims. But using this exchange workers should be able to distribute work
// efficiently and they would be able to reduce their polling interval
// significantly without affecting general responsiveness.
//
// See http://docs.taskcluster.net/queue/exchanges/#taskPending
type TaskPending struct {
	RoutingKeyKind string `mwords:"*"`
	TaskId         string `mwords:"*"`
	RunId          string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerId       string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	SchedulerId    string `mwords:"*"`
	TaskGroupId    string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (x TaskPending) RoutingKey() string {
	return generateRoutingKey(&x)
}

func (x TaskPending) ExchangeName() string {
	return "task-pending"
}

// Whenever a task is claimed by a worker, a run is started on the worker,
// and a message is posted on this exchange.
//
// See http://docs.taskcluster.net/queue/exchanges/#taskRunning
type TaskRunning struct {
	RoutingKeyKind string `mwords:"*"`
	TaskId         string `mwords:"*"`
	RunId          string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerId       string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	SchedulerId    string `mwords:"*"`
	TaskGroupId    string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (x TaskRunning) RoutingKey() string {
	return generateRoutingKey(&x)
}

func (x TaskRunning) ExchangeName() string {
	return "task-running"
}

// Whenever the `createArtifact` end-point is called, the queue will create
// a record of the artifact and post a message on this exchange. All of this
// happens before the queue returns a signed URL for the caller to upload
// the actual artifact with (pending on `storageType`).
//
// This means that the actual artifact is rarely available when this message
// is posted. But it is not unreasonable to assume that the artifact will
// will become available at some point later. Most signatures will expire in
// 30 minutes or so, forcing the uploader to call `createArtifact` with
// the same payload again in-order to continue uploading the artifact.
//
// However, in most cases (especially for small artifacts) it's very
// reasonable assume the artifact will be available within a few minutes.
// This property means that this exchange is mostly useful for tools
// monitoring task evaluation. One could also use it count number of
// artifacts per task, or _index_ artifacts though in most cases it'll be
// smarter to index artifacts after the task in question have completed
// successfully.
//
// See http://docs.taskcluster.net/queue/exchanges/#artifactCreated
type ArtifactCreated struct {
	RoutingKeyKind string `mwords:"*"`
	TaskId         string `mwords:"*"`
	RunId          string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerId       string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	SchedulerId    string `mwords:"*"`
	TaskGroupId    string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (x ArtifactCreated) RoutingKey() string {
	return generateRoutingKey(&x)
}

func (x ArtifactCreated) ExchangeName() string {
	return "artifact-created"
}

// When a task is successfully completed by a worker a message is posted
// this exchange.
// This message is routed using the `runId`, `workerGroup` and `workerId`
// that completed the task. But information about additional runs is also
// available from the task status structure.
//
// See http://docs.taskcluster.net/queue/exchanges/#taskCompleted
type TaskCompleted struct {
	RoutingKeyKind string `mwords:"*"`
	TaskId         string `mwords:"*"`
	RunId          string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerId       string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	SchedulerId    string `mwords:"*"`
	TaskGroupId    string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (x TaskCompleted) RoutingKey() string {
	return generateRoutingKey(&x)
}

func (x TaskCompleted) ExchangeName() string {
	return "task-completed"
}

// When a task ran, but failed to complete successfully a message is posted
// to this exchange. This is same as worker ran task-specific code, but the
// task specific code exited non-zero.
//
// See http://docs.taskcluster.net/queue/exchanges/#taskFailed
type TaskFailed struct {
	RoutingKeyKind string `mwords:"*"`
	TaskId         string `mwords:"*"`
	RunId          string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerId       string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	SchedulerId    string `mwords:"*"`
	TaskGroupId    string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (x TaskFailed) RoutingKey() string {
	return generateRoutingKey(&x)
}

func (x TaskFailed) ExchangeName() string {
	return "task-failed"
}

// Whenever TaskCluster fails to run a message is posted to this exchange.
// This happens if the task isn't completed before its `deadlìne`,
// all retries failed (i.e. workers stopped responding), the task was
// canceled by another entity, or the task carried a malformed payload.
//
// The specific _reason_ is evident from that task status structure, refer
// to the `reasonResolved` property for the last run.
//
// See http://docs.taskcluster.net/queue/exchanges/#taskException
type TaskException struct {
	RoutingKeyKind string `mwords:"*"`
	TaskId         string `mwords:"*"`
	RunId          string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerId       string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	SchedulerId    string `mwords:"*"`
	TaskGroupId    string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (x TaskException) RoutingKey() string {
	return generateRoutingKey(&x)
}

func (x TaskException) ExchangeName() string {
	return "task-exception"
}

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
// See: http://references.taskcluster.net/scheduler/v1/api.json
type SchedulerAPI struct {
	Auth
}

// Returns a pointer to SchedulerAPI, configured to run against production.
// If you wish to point at a different API endpoint url, set the BaseURL struct
// member to your chosen location. You may also disable authentication (for
// example if you wish to use the taskcluster-proxy) by setting Authenticate
// struct member to false.
//
// For example:
//  schedulerAPI := client.NewSchedulerAPI("123", "456")                 // set clientId and accessToken
//  schedulerAPI.Authenticate = false                                    // disable authentication (true by default)
//  schedulerAPI.BaseURL = "http://localhost:1234/api/SchedulerAPI/v1"   // alternative API endpoint (production by default)
// data, httpResponse := schedulerAPI.CreateTaskGraph(.....)            // for example, call the CreateTaskGraph(.....) API endpoint (described further down)...
func NewSchedulerAPI(clientId string, accessToken string) *SchedulerAPI {
	r := &SchedulerAPI{}
	r.ClientId = clientId
	r.AccessToken = accessToken
	r.BaseURL = "https://scheduler.taskcluster.net/v1"
	r.Authenticate = true
	return r
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
func (a *SchedulerAPI) CreateTaskGraph(taskGraphId string, payload *TaskGraphDefinition1) (*TaskGraphStatusResponse, *http.Response) {
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
func (a *SchedulerAPI) ExtendTaskGraph(taskGraphId string, payload *TaskGraphDefinition) (*TaskGraphStatusResponse, *http.Response) {
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
func (a *SchedulerAPI) Status(taskGraphId string) (*TaskGraphStatusResponse, *http.Response) {
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
func (a *SchedulerAPI) Info(taskGraphId string) (*TaskGraphInfoResponse, *http.Response) {
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
func (a *SchedulerAPI) Inspect(taskGraphId string) (*InspectTaskGraphResponse, *http.Response) {
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
func (a *SchedulerAPI) InspectTask(taskGraphId string, taskId string) (*InspectTaskGraphTaskResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/task-graph/"+taskGraphId+"/inspect/"+taskId+"", new(InspectTaskGraphTaskResponse))
	return responseObject.(*InspectTaskGraphTaskResponse), httpResponse
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/scheduler/api-docs/#ping
func (a *SchedulerAPI) Ping() *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/ping", nil)
	return httpResponse
}

// The scheduler, typically available at `scheduler.taskcluster.net` is
// responsible for accepting task-graphs and schedule tasks on the queue as
// their dependencies are completed successfully.
//
// This document describes the AMQP exchanges offered by the scheduler,
// which allows third-party listeners to monitor task-graph submission and
// resolution. These exchanges targets the following audience:
//  * Reporters, who displays the state of task-graphs or emails people on
//    failures, and
//  * End-users, who wants notification of completed task-graphs
//
// **Remark**, the task-graph scheduler will require that the `schedulerId`
// for tasks is set to the `schedulerId` for the task-graph scheduler. In
// production the `schedulerId` is typically `"task-graph-scheduler"`.
// Furthermore, the task-graph scheduler will also require that
// `taskGroupId` is equal to the `taskGraphId`.
//
// Combined these requirements ensures that `schedulerId` and `taskGroupId`
// have the same position in the routing keys for the queue exchanges.
// See queue documentation for details on queue exchanges. Hence, making
// it easy to listen for all tasks in a given task-graph.
//
// Note that routing key entries 2 through 7 used for exchanges on the
// task-graph scheduler is hardcoded to `_`. This is done to preserve
// positional equivalence with exchanges offered by the queue.
type SchedulerExchanges struct {
}

// When a task-graph is submitted it immediately starts running and a
// message is posted on this exchange to indicate that a task-graph have
// been submitted.
//
// See http://docs.taskcluster.net/scheduler/events/#taskGraphRunning
type TaskGraphRunning struct {
	RoutingKeyKind string `mwords:"*"`
	TaskId         string `mwords:"*"`
	RunId          string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerId       string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	SchedulerId    string `mwords:"*"`
	TaskGraphId    string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (x TaskGraphRunning) RoutingKey() string {
	return generateRoutingKey(&x)
}

func (x TaskGraphRunning) ExchangeName() string {
	return "task-graph-running"
}

// When a task-graph is extended, that is additional tasks is added to the
// task-graph, a message is posted on this exchange. This is useful if you
// are monitoring a task-graph and what to track states of the individual
// tasks in the task-graph.
//
// See http://docs.taskcluster.net/scheduler/events/#taskGraphExtended
type TaskGraphExtended struct {
	RoutingKeyKind string `mwords:"*"`
	TaskId         string `mwords:"*"`
	RunId          string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerId       string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	SchedulerId    string `mwords:"*"`
	TaskGraphId    string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (x TaskGraphExtended) RoutingKey() string {
	return generateRoutingKey(&x)
}

func (x TaskGraphExtended) ExchangeName() string {
	return "task-graph-extended"
}

// When a task is completed unsuccessfully and all reruns have been
// attempted, the task-graph will not complete successfully and it's
// declared to be _blocked_, by some task that consistently completes
// unsuccessfully.
//
// When a task-graph becomes blocked a messages is posted to this exchange.
// The message features the `taskId` of the task that caused the task-graph
// to become blocked.
//
// See http://docs.taskcluster.net/scheduler/events/#taskGraphBlocked
type TaskGraphBlocked struct {
	RoutingKeyKind string `mwords:"*"`
	TaskId         string `mwords:"*"`
	RunId          string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerId       string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	SchedulerId    string `mwords:"*"`
	TaskGraphId    string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (x TaskGraphBlocked) RoutingKey() string {
	return generateRoutingKey(&x)
}

func (x TaskGraphBlocked) ExchangeName() string {
	return "task-graph-blocked"
}

// When all tasks of a task-graph have completed successfully, the
// task-graph is declared to be finished, and a message is posted to this
// exchange.
//
// See http://docs.taskcluster.net/scheduler/events/#taskGraphFinished
type TaskGraphFinished struct {
	RoutingKeyKind string `mwords:"*"`
	TaskId         string `mwords:"*"`
	RunId          string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerId       string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	SchedulerId    string `mwords:"*"`
	TaskGraphId    string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (x TaskGraphFinished) RoutingKey() string {
	return generateRoutingKey(&x)
}

func (x TaskGraphFinished) ExchangeName() string {
	return "task-graph-finished"
}
