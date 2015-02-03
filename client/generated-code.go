// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the client subdirectory:
//
// go generate && go fmt

package client

type (
	// Response to a request for an Shared-Access-Signature to access and Azure
	// Table Storage table.
	AzureSharedAccessSignatureResponse struct {
		// Date and time of when the Shared-Access-Signature expires.
		Expiry string
		// Shared-Access-Signature string. This is the querystring parameters to
		// be appened after `?` or `&` depending on whether or not a querystring is
		// already present in the URL.
		Sas string
	}

	// Credentials, scopes and expiration date for a client
	GetClientCredentialsResponse struct {
		// AccessToken used for authenticating requests
		AccessToken string
		// ClientId of the client scopes is requested about
		ClientId string
		// Date and time where the clients credentials are set to expire
		Expires string
		// List of scopes the client is authorized to access
		Scopes []string
	}

	// Scopes and expiration date for a client
	GetClientScopesResponse struct {
		// ClientId of the client scopes is requested about
		ClientId string
		// Date and time where the clients credentials are set to expire
		Expires string
		// List of scopes the client is authorized to access
		Scopes []string
	}

	// Credentials, scopes and expiration date for a client
	GetClientCredentialsResponse1 struct {
		// Description of what these credentials are used for in markdown.
		// Please write a few details here, including who is the owner, point of
		// contact. Why it is scoped as is, think of this as documentation.
		Description string
		// Date and time where the clients credentials are set to expire
		Expires string
		// Human readable name of this set of credentials, typical
		// component/server-name or IRC nickname of the user.
		Name string
		// List of scopes the client is authorized to access
		Scopes []string
	}

	// Get all detaisl about a client, useful for tools modifying a client
	GetClientResponse struct {
		// AccessToken used for authenticating requests
		AccessToken string
		// ClientId of the client scopes is requested about
		ClientId string
		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		// Why it is scoped as is, think of this as documentation.
		Description string
		// Date and time where the clients credentials are set to expire
		Expires string
		// Human readable name of this set of credentials, typical
		// component/server-name or IRC nickname of the user.
		Name string
		// List of scopes the client is authorized to access
		Scopes []string
	}

	// Get a list of all clients, including basic information, but not credentials.
	ListClientsResponse struct {
	}

	// Representation of an indexed task.
	IndexedTaskResponse struct {
		// Data that was reported with the task. This is an arbitrary JSON object.
		Data struct {
		}
		// Date at which this entry expires from the task index.
		Expires string
		// Namespace of the indexed task, used to find the indexed task in the index.
		Namespace string
		// If multiple tasks are indexed with the same `namespace` the task with the
		// highest `rank` will be stored and returned in later requests. If two tasks
		// has the same `rank` the latest task will be stored.
		Rank int
		// Unique task identifier, this is UUID encoded as
		// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
		// stripped of `=` padding.
		TaskId string
	}

	// Representation of an a task to be indexed.
	InsertTaskRequest struct {
		// This is an arbitrary JSON object. Feel free to put whatever data you want
		// here, but do limit it, you'll get errors if you store more than 32KB.
		// So stay well, below that limit.
		Data struct {
		}
		// Date at which this entry expires from the task index.
		Expires string
		// If multiple tasks are indexed with the same `namespace` the task with the
		// highest `rank` will be stored and returned in later requests. If two tasks
		// has the same `rank` the latest task will be stored.
		Rank int
		// Unique task identifier, this is UUID encoded as
		// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
		// stripped of `=` padding.
		TaskId string
	}

	// Request to list namespaces within a given namespace.
	ListNamespacesRequest struct {
		// A continuation token previously returned in a response to this list
		// request. This property is optional and should not be provided for first
		// requests.
		ContinuationToken string
		// Maximum number of results per page. If there are more results than this
		// a continuation token will be return.
		Limit int
	}

	// Response from a request to list namespaces within a given namespace.
	ListNamespacesResponse struct {
		// A continuation token is returned if there are more results than listed
		// here. You can optionally provide the token in the request payload to
		// load the additional results.
		ContinuationToken string
		// List of namespaces.
		Namespaces []struct {
			// Date at which this entry, and by implication all entries below it,
			// expires from the task index.
			Expires string
			// Name of namespace within it's parent namespace.
			Name unknown
			// Fully qualified name of the namespace, you can use this to list
			// namespaces or tasks under this namespace.
			Namespace string
		}
	}

	// Request to list tasks within a given namespace.
	ListTasksRequest struct {
		// A continuation token previously returned in a response to this list
		// request. This property is optional and should not be provided for first
		// requests.
		ContinuationToken string
		// Maximum number of results per page. If there are more results than this
		// a continuation token will be return.
		Limit int
	}

	// Representation of an indexed task.
	ListTasksResponse struct {
		// A continuation token is returned if there are more results than listed
		// here. You can optionally provide the token in the request payload to
		// load the additional results.
		ContinuationToken string
		// List of tasks.
		Tasks []struct {
			// Data that was reported with the task. This is an arbitrary JSON
			// object.
			Data struct {
			}
			// Date at which this entry expires from the task index.
			Expires string
			// Namespace of the indexed task, used to find the indexed task in the
			// index.
			Namespace string
			// If multiple tasks are indexed with the same `namespace` the task
			// with the highest `rank` will be stored and returned in later
			// requests. If two tasks has the same `rank` the latest task will be
			// stored.
			Rank int
			// Unique task identifier, this is UUID encoded as
			// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
			// stripped of `=` padding.
			TaskId string
		}
	}

	// Message reporting a new artifact has been created for a given task.
	ArtifactCreatedMessage struct {
		// Information about the artifact that was created
		Artifact unknown
		// Id of the run on which artifact was created.
		RunId  int
		Status unknown
		// Message version
		Version unknown
		// Identifier for the worker-group within which the run with the created
		// artifacted is running.
		WorkerGroup string
		// Identifier for the worker within which the run with the created artifact
		// is running.
		WorkerId string
	}

	// Request to claim work
	WorkClaimRequest struct {
		// Identifier for group that worker claiming the task is a part of.
		WorkerGroup string
		// Identifier for worker within the given workerGroup
		WorkerId string
	}

	// Definition of a task that can be scheduled
	TaskDefinition struct {
		// Creation time of task
		Created string
		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline
		Deadline string
		// Object with properties that can hold any kind of extra data that should be
		// associated with the task. This can be data for the task which doesn't
		// fit into `payload`, or it can supplementary data for use in services
		// listening for events from this task. For example this could be details to
		// display on _treeherder_, or information for indexing the task. Please, try
		// to put all related information under one property, so `extra` data keys
		// for treeherder reporting and task indexing don't conflict, hence, we have
		// reusable services. **Warning**, do not stuff large data-sets in here,
		// task definitions should not take-up multiple MiBs.
		Extra struct {
		}
		// Required task metadata
		Metadata struct {
			// Human readable description of the task, please **explain** what the
			// task does. A few lines of documentation is not going to hurt you.
			Description string
			// Human readable name of task, used to very briefly given an idea about
			// what the task does.
			Name string
			// E-mail of person who caused this task, e.g. the person who did
			// `hg push`. The person we should contact to ask why this task is here.
			Owner string
			// Link to source of this task, should specify a file, revision and
			// repository. This should be place someone can go an do a git/hg blame
			// to who came up with recipe for this task.
			Source string
		}
		// Task-specific payload following worker-specific format. For example the
		// `docker-worker` requires keys like: `image`, `commands` and
		// `features`. Refer to the documentation of `docker-worker` for details.
		Payload struct {
		}
		// Unique identifier for a provisioner, that can supply specified
		// `workerType`
		ProvisionerId string
		// Number of times to retry the task in case of infrastructure issues.
		// An _infrastructure issue_ is a worker node that crashes or is shutdown,
		// these events are to be expected.
		Retries int
		// List of task specific routes, AMQP messages will be CC'ed to these routes.
		Routes []string
		// Identifier for the scheduler that _defined_ this task, this can be an
		// identifier for a user or a service like the `"task-graph-scheduler"`.
		// Along with the `taskGroupId` this is used to form the permission scope
		// `queue:assume:scheduler-id:<schedulerId>/<taskGroupId>`,
		// this scope is necessary to _schedule_ a defined task, or _rerun_ a task.
		SchedulerId string
		// List of scopes (or scope-patterns) that the task is
		// authorized to use.
		Scopes []string
		// Arbitrary key-value tags (only strings limited to 4k). These can be used
		// to attach informal meta-data to a task. Use this for informal tags that
		// tasks can be classified by. You can also think of strings here as
		// candidates for formal meta-data. Something like
		// `purpose: 'build' || 'test'` is a good example.
		Tags struct {
		}
		// Identifier for a group of tasks scheduled together with this task, by
		// scheduler identified by `schedulerId`. For tasks scheduled by the
		// task-graph scheduler, this is the `taskGraphId`.  Defaults to `taskId` if
		// property isn't specified.
		TaskGroupId string
		// Unique identifier for a worker-type within a specific provisioner
		WorkerType string
	}

	// List of artifacts for a given `taskId` and `runId`.
	ListArtifactsResponse struct {
		// List of artifacts for given `taskId` and `runId`.
		Artifacts array
	}

	// Response to request for poll task urls.
	PollTaskUrlsResponse struct {
		// Date and time after which the signed URLs provided in this response
		// expires and not longer works for authentication.
		Expires string
		// List of signed URLs to poll tasks from, they must be called in the order
		// they are given. As the first entry in this array **may** have higher
		// priority.
		SignedPollTaskUrls []string
	}

	// Request a authorization to put and artifact or posting of a URL as an artifact. Note that the `storageType` property is referenced in the response as well.
	PostArtifactRequest struct {
	}

	// Response to a request for posting an artifact. Note that the `storageType` property is referenced in the request as well.
	PostArtifactResponse struct {
	}

	// Request to claim (or reclaim) a task
	TaskClaimRequest struct {
		// MessageId from Azure Queue message
		MessageId string
		// PopReceipt from Azure Queue message
		Receipt string
		// Signature from the MessageText in Azure Queue message
		Signature string
		// Identifier for group that worker claiming the task is a part of.
		WorkerGroup string
		// Identifier for worker within the given workerGroup
		WorkerId string
	}

	// Response to a successful task claim
	TaskClaimResponse struct {
		// `run-id` assigned to this run of the task
		RunId  int
		Status unknown
		// Time at which the run expires and is resolved as `failed`, if the run isn't reclaimed.
		TakenUntil string
		// Identifier for the worker-group within which this run started.
		WorkerGroup string
		// Identifier for the worker executing this run.
		WorkerId string
	}

	// Message reporting that a task has complete successfully.
	TaskCompletedMessage struct {
		// Id of the run that completed the task
		RunId  int
		Status unknown
		// Message version
		Version unknown
		// Identifier for the worker-group within which this run ran.
		WorkerGroup string
		// Identifier for the worker that executed this run.
		WorkerId string
	}

	// Request for a task to be declared completed
	TaskCompletedRequest struct {
		// True, if task is completed, and false if task is failed. This property
		// is optional and only present for backwards compatibility. It will be
		// removed in the future.
		Success boolean
	}

	// Message reporting that a task has been defined. The task may or may not be
	// _scheduled_ too.
	TaskDefinedMessage struct {
		Status unknown
		// Message version
		Version unknown
	}

	// Message reporting that TaskCluster have failed to run a task.
	TaskExceptionMessage struct {
		// Id of the last run for the task, not provided if `deadline`
		// was exceeded before a run was started.
		RunId  int
		Status unknown
		// Message version
		Version unknown
		// Identifier for the worker-group within which the last attempt of the task
		// ran. Not provided, if `deadline` was exceeded before a run was started.
		WorkerGroup string
		// Identifier for the last worker that failed to report, causing the task
		// to fail. Not provided, if `deadline` was exceeded before a run
		// was started.
		WorkerId string
	}

	// Request for a run of a task to be resolved with an exception
	TaskExceptionRequest struct {
		// Reason that the task is resolved with an exception. This is a subset
		// of the values for `resolvedReason` given in the task status structure.
		// Please, report `worker-shutdown` if the run failed because the worker
		// had to shutdown (spot node disappearing).
		// And report `malformed-payload` if the `task.payload` doesn't match the
		// schema for the worker payload, or referenced dependencies doesn't exists.
		// In either case, you should still log the error to a log file under the
		// specific run.
		Reason unknown
	}

	// Message reporting that a task failed to complete successfully.
	TaskFailedMessage struct {
		// Id of the run that failed.
		RunId  int
		Status unknown
		// Message version
		Version unknown
		// Identifier for the worker-group within which this run ran.
		WorkerGroup string
		// Identifier for the worker that executed this run.
		WorkerId string
	}

	// Message reporting that a task is now pending
	TaskPendingMessage struct {
		// Id of run that became pending, `run-id`s always starts from 0
		RunId  int
		Status unknown
		// Message version
		Version unknown
	}

	// Message reporting that a given run of a task have started
	TaskRunningMessage struct {
		// Id of the run that just started, always starts from 0
		RunId  int
		Status unknown
		// Time at which the run expires and is resolved as `failed`, if the run
		// isn't reclaimed.
		TakenUntil string
		// Message version
		Version unknown
		// Identifier for the worker-group within which this run started.
		WorkerGroup string
		// Identifier for the worker executing this run.
		WorkerId string
	}

	// Response to a task status request
	TaskStatusResponse struct {
		Status unknown
	}

	// A representation of **task status** as known by the queue
	TaskStatusStructure struct {
		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline
		Deadline string
		// Unique identifier for the provisioner that this task must be scheduled on
		ProvisionerId string
		// Number of retries left for the task in case of infrastructure issues
		RetriesLeft int
		// List of runs, ordered so that index `i` has `runId == i`
		Runs []struct {
			// Reason for the creation of this run,
			// **more reasons may be added in the future**."
			ReasonCreated unknown
			// Reason that run was resolved, this is mainly
			// useful for runs resolved as `exception`.
			// Note, **more reasons may be added in the future**, also this
			// property is only available after the run is resolved.
			ReasonResolved unknown
			// Date-time at which this run was resolved, ie. when the run changed
			// state from `running` to either `completed`, `failed` or `exception`.
			// This property is only present after the run as been resolved.
			Resolved string
			// Id of this task run, `run-id`s always starts from `0`
			RunId int
			// Date-time at which this run was scheduled, ie. when the run was
			// created in state `pending`.
			Scheduled string
			// Date-time at which this run was claimed, ie. when the run changed
			// state from `pending` to `running`. This property is only present
			// after the run has been claimed.
			Started string
			// State of this run
			State unknown
			// Time at which the run expires and is resolved as `failed`, if the
			// run isn't reclaimed. Note, only present after the run has been
			// claimed.
			TakenUntil string
			// Identifier for group that worker who executes this run is a part of,
			// this identifier is mainly used for efficient routing.
			// Note, this property is only present after the run is claimed.
			WorkerGroup string
			// Identifier for worker evaluating this run within given
			// `workerGroup`. Note, this property is only available after the run
			// has been claimed.
			WorkerId string
		}
		// Identifier for the scheduler that _defined_ this task.
		SchedulerId string
		// State of this task. This is just an auxiliary property derived from state
		// of latests run, or `unscheduled` if none.
		State unknown
		// Identifier for a group of tasks scheduled together with this task, by
		// scheduler identified by `schedulerId`. For tasks scheduled by the
		// task-graph scheduler, this is the `taskGraphId`.
		TaskGroupId string
		// Unique task identifier, this is UUID encoded as
		// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
		// stripped of `=` padding.
		TaskId string
		// Identifier for worker type within the specified provisioner
		WorkerType string
	}

	// Definition of a task that can be scheduled
	TaskDefinition1 struct {
		// Creation time of task
		Created string
		// Deadline of the task, `pending` and `running` runs are resolved as **failed** if not resolved by other means before the deadline
		Deadline string
		// Object with properties that can hold any kind of extra data that should be
		// associated with the task. This can be data for the task which doesn't
		// fit into `payload`, or it can supplementary data for use in services
		// listening for events from this task. For example this could be details to
		// display on _treeherder_, or information for indexing the task. Please, try
		// to put all related information under one property, so `extra` data keys
		// for treeherder reporting and task indexing don't conflict, hence, we have
		// reusable services. **Warning**, do not stuff large data-sets in here,
		// task definitions should not take-up multiple MiBs.
		Extra struct {
		}
		// Required task metadata
		Metadata struct {
			// Human readable description of the task, please **explain** what the
			// task does. A few lines of documentation is not going to hurt you.
			Description string
			// Human readable name of task, used to very briefly given an idea about
			// what the task does.
			Name string
			// E-mail of person who caused this task, e.g. the person who did
			// `hg push`. The person we should contact to ask why this task is here.
			Owner string
			// Link to source of this task, should specify a file, revision and
			// repository. This should be place someone can go an do a git/hg blame
			// to who came up with recipe for this task.
			Source string
		}
		// Task-specific payload following worker-specific format. For example the
		// `docker-worker` requires keys like: `image`, `commands` and
		// `features`. Refer to the documentation of `docker-worker` for details.
		Payload struct {
		}
		// Unique identifier for a provisioner, that can supply specified
		// `workerType`
		ProvisionerId string
		// Number of times to retry the task in case of infrastructure issues.
		// An _infrastructure issue_ is a worker node that crashes or is shutdown,
		// these events are to be expected.
		Retries int
		// List of task specific routes, AMQP messages will be CC'ed to these routes.
		Routes []string
		// Identifier for the scheduler that _defined_ this task, this can be an
		// identifier for a user or a service like the `"task-graph-scheduler"`.
		// Along with the `taskGroupId` this is used to form the permission scope
		// `queue:assume:scheduler-id:<schedulerId>/<taskGroupId>`,
		// this scope is necessary to _schedule_ a defined task, or _rerun_ a task.
		SchedulerId string
		// List of scopes (or scope-patterns) that the task is
		// authorized to use.
		Scopes []string
		// Arbitrary key-value tags (only strings limited to 4k). These can be used
		// to attach informal meta-data to a task. Use this for informal tags that
		// tasks can be classified by. You can also think of strings here as
		// candidates for formal meta-data. Something like
		// `purpose: 'build' || 'test'` is a good example.
		Tags struct {
		}
		// Identifier for a group of tasks scheduled together with this task, by
		// scheduler identified by `schedulerId`. For tasks scheduled by the
		// task-graph scheduler, this is the `taskGraphId`.  Defaults to `taskId` if
		// property isn't specified.
		TaskGroupId string
		// Unique identifier for a worker-type within a specific provisioner
		WorkerType string
	}

	// Definition of a task-graph that can be scheduled
	TaskGraphDefinition struct {
		// List of nodes in the task-graph, each featuring a task definition and scheduling preferences, such as number of _reruns_ to attempt.
		Tasks []struct {
			// List of required `taskId`s
			Requires []string
			// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
			Reruns int
			Task   unknown
			// Task identifier (`taskId`) for the task when submitted to the queue, also used in `requires` below. This must be formatted as a **slugid** that is a uuid encoded in url-safe base64 following [RFC 4648 sec. 5](http://tools.ietf.org/html/rfc4648#section-5)), but without `==` padding.
			TaskId string
		}
	}

	// Information about a **task-graph** as known by the scheduler, with all the state of all individual tasks.
	InspectTaskGraphResponse struct {
		// Required task metadata
		Metadata struct {
			// Human readable description of task-graph, **explain** what it does!
			Description string
			// Human readable name of task-graph
			Name string
			// E-mail of person who caused this task-graph, e.g. the person who did `hg push`
			Owner string
			// Link to source of this task-graph, should specify file, revision and repository
			Source string
		}
		Status unknown
		// Arbitrary key-value tags (only strings limited to 4k)
		Tags struct {
		}
		// Mapping from task-labels to task information and state.
		Tasks []struct {
			// List of `taskId`s that requires this task to be _complete successfully_ before they can be scheduled.
			Dependents []string
			// Human readable name from the task definition
			Name string
			// List of required `taskId`s
			Requires []string
			// List of `taskId`s that have yet to complete successfully, before this task can be scheduled.
			RequiresLeft []string
			// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
			Reruns int
			// Number of reruns that haven't been used yet.
			RerunsLeft int
			// true, if the scheduler considers the task node as satisfied and hence no-longer prevents dependent tasks from running.
			Satisfied boolean
			// State of the task as considered by the scheduler
			State unknown
			// Unique task identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
			TaskId string
		}
	}

	// Information about a **task** in a task-graph as known by the scheduler.
	InspectTaskGraphTaskResponse struct {
		// List of `taskId`s that requires this task to be _complete successfully_ before they can be scheduled.
		Dependents []string
		// Human readable name from the task definition
		Name string
		// List of required `taskId`s
		Requires []string
		// List of `taskId`s that have yet to complete successfully, before this task can be scheduled.
		RequiresLeft []string
		// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
		Reruns int
		// Number of reruns that haven't been used yet.
		RerunsLeft int
		// true, if the scheduler considers the task node as satisfied and hence no-longer prevents dependent tasks from running.
		Satisfied boolean
		// State of the task as considered by the scheduler
		State unknown
		// Unique task identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
		TaskId string
	}

	// Message that all reruns of a task has failed it is now blocking the task-graph from finishing.
	BlockedTaskGraphMessage struct {
		Status unknown
		// Unique `taskId` that is blocking this task-graph from completion.
		TaskId string
		// Message version
		Version unknown
	}

	// Messages as posted to `scheduler/v1/task-graph-extended` informing the world that a task-graph have been extended.
	TaskGraphExtendedMessage struct {
		Status unknown
		// Message version
		Version unknown
	}

	// Message that all tasks in a task-graph have now completed successfully and the graph is _finished_.
	TaskGraphFinishedMessage struct {
		Status unknown
		// Message version
		Version unknown
	}

	// Response for a request for task-graph information
	TaskGraphInfoResponse struct {
		// Required task metadata
		Metadata struct {
			// Human readable description of task-graph, **explain** what it does!
			Description string
			// Human readable name of task-graph
			Name string
			// E-mail of person who caused this task-graph, e.g. the person who did `hg push`
			Owner string
			// Link to source of this task-graph, should specify file, revision and repository
			Source string
		}
		Status unknown
		// Arbitrary key-value tags (only strings limited to 4k)
		Tags struct {
		}
	}

	// Messages as posted to `scheduler/v1/task-graph-running` informing the world that a new task-graph have been submitted.
	NewTaskGraphMessage struct {
		Status unknown
		// Message version
		Version unknown
	}

	// Response containing the status structure for a task-graph
	TaskGraphStatusResponse struct {
		Status unknown
	}

	// Response containing the status structure for a task-graph
	TaskGraphStatusResponse1 struct {
		Status unknown
	}

	// A representation of **task-graph status** as known by the scheduler, without the state of all individual tasks.
	TaskGraphStatusStructure struct {
		// Unique identifier for task-graph scheduler managing the given task-graph
		SchedulerId string
		// Task-graph state, this enum is **frozen** new values will **not** be added.
		State unknown
		// Unique task-graph identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
		TaskGraphId string
	}

	// Definition of a task-graph that can be scheduled
	TaskGraphDefinition1 struct {
		// Required task metadata"
		Metadata struct {
			// Human readable description of task-graph, **explain** what it does!
			Description string
			// Human readable name of task-graph, give people finding this an idea
			// what this graph is about.
			Name string
			// E-mail of person who caused this task-graph, e.g. the person who did
			// `hg push` or whatever triggered it.
			Owner string
			// Link to source of this task-graph, should specify file, revision and
			// repository
			Source string
		}
		// List of task-graph specific routes, AMQP messages will be CC'ed to these
		// routes prefixed by `'route.'`.
		Routes []string
		// List of scopes (or scope-patterns) that tasks of the task-graph is
		// authorized to use.
		Scopes []string
		// Arbitrary key-value tags (only strings limited to 4k)
		Tags struct {
		}
		// List of nodes in the task-graph, each featuring a task definition and scheduling preferences, such as number of _reruns_ to attempt.
		Tasks []struct {
			// List of required `taskId`s
			Requires []string
			// Number of times to _rerun_ the task if it completed unsuccessfully. **Note**, this does not capture _retries_ due to infrastructure issues.
			Reruns int
			Task   unknown
			// Task identifier (`taskId`) for the task when submitted to the queue, also used in `requires` below. This must be formatted as a **slugid** that is a uuid encoded in url-safe base64 following [RFC 4648 sec. 5](http://tools.ietf.org/html/rfc4648#section-5)), but without `==` padding.
			TaskId string
		}
	}
)
