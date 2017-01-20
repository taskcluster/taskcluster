// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/scheduler/v1/api.json

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
// See: https://docs.taskcluster.net/reference/platform/scheduler/api-docs
//
// How to use this package
//
// First create a Scheduler object:
//
//  myScheduler := scheduler.New(&tcclient.Credentials{ClientID: "myClientID", AccessToken: "myAccessToken"})
//
// and then call one or more of myScheduler's methods, e.g.:
//
//  data, err := myScheduler.CreateTaskGraph(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/scheduler/v1/api.json together with the input and output schemas it references, downloaded on
// Fri, 20 Jan 2017 at 20:24:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package scheduler

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type Scheduler tcclient.ConnectionData

// Returns a pointer to Scheduler, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false (in which case creds is
// ignored).
//
// For example:
//  creds := &tcclient.Credentials{
//  	ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
//  	AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
//  	Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
//  }
//  myScheduler := scheduler.New(creds)                              // set credentials
//  myScheduler.Authenticate = false                                 // disable authentication (creds above are now ignored)
//  myScheduler.BaseURL = "http://localhost:1234/api/Scheduler/v1"   // alternative API endpoint (production by default)
//  data, err := myScheduler.CreateTaskGraph(.....)                  // for example, call the CreateTaskGraph(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Scheduler {
	myScheduler := Scheduler(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://scheduler.taskcluster.net/v1",
		Authenticate: true,
	})
	return &myScheduler
}

// Stability: *** EXPERIMENTAL ***
//
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
// (`queue:define-task:..` or `queue:create-task:..`; see the queue for
// details on scopes required). Note, the task-graph does not require
// permissions to schedule the tasks (`queue:schedule-task:..`), as this is
// done with scopes provided by the task-graph scheduler.
//
// **Task-graph specific routing-keys**, using the `taskGraph.routes`
// property you may define task-graph specific routing-keys. If a task-graph
// has a task-graph specific routing-key: `<route>`, then the poster will
// be required to posses the scope `scheduler:route:<route>`. And when the
// an AMQP message about the task-graph is published the message will be
// CC'ed with the routing-key: `route.<route>`. This is useful if you want
// another component to listen for completed tasks you have posted.
//
// Required scopes:
//   * scheduler:create-task-graph
//
// See https://docs.taskcluster.net/reference/platform/scheduler/api-docs#createTaskGraph
func (myScheduler *Scheduler) CreateTaskGraph(taskGraphId string, payload *TaskGraphDefinition) (*TaskGraphStatusResponse, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/task-graph/"+url.QueryEscape(taskGraphId), new(TaskGraphStatusResponse), nil)
	return responseObject.(*TaskGraphStatusResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
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
// Required scopes:
//   * scheduler:extend-task-graph:<taskGraphId>
//
// See https://docs.taskcluster.net/reference/platform/scheduler/api-docs#extendTaskGraph
func (myScheduler *Scheduler) ExtendTaskGraph(taskGraphId string, payload *TaskGraphDefinition1) (*TaskGraphStatusResponse, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/task-graph/"+url.QueryEscape(taskGraphId)+"/extend", new(TaskGraphStatusResponse), nil)
	return responseObject.(*TaskGraphStatusResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Get task-graph status, this will return the _task-graph status
// structure_. which can be used to check if a task-graph is `running`,
// `blocked` or `finished`.
//
// **Note**, that `finished` implies successfully completion.
//
// See https://docs.taskcluster.net/reference/platform/scheduler/api-docs#status
func (myScheduler *Scheduler) Status(taskGraphId string) (*TaskGraphStatusResponse, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task-graph/"+url.QueryEscape(taskGraphId)+"/status", new(TaskGraphStatusResponse), nil)
	return responseObject.(*TaskGraphStatusResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Get task-graph information, this includes the _task-graph status
// structure_, along with `metadata` and `tags`, but not information
// about all tasks.
//
// If you want more detailed information use the `inspectTaskGraph`
// end-point instead.
//
// See https://docs.taskcluster.net/reference/platform/scheduler/api-docs#info
func (myScheduler *Scheduler) Info(taskGraphId string) (*TaskGraphInfoResponse, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task-graph/"+url.QueryEscape(taskGraphId)+"/info", new(TaskGraphInfoResponse), nil)
	return responseObject.(*TaskGraphInfoResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
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
// See https://docs.taskcluster.net/reference/platform/scheduler/api-docs#inspect
func (myScheduler *Scheduler) Inspect(taskGraphId string) (*InspectTaskGraphResponse, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task-graph/"+url.QueryEscape(taskGraphId)+"/inspect", new(InspectTaskGraphResponse), nil)
	return responseObject.(*InspectTaskGraphResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
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
// See https://docs.taskcluster.net/reference/platform/scheduler/api-docs#inspectTask
func (myScheduler *Scheduler) InspectTask(taskGraphId, taskId string) (*InspectTaskGraphTaskResponse, error) {
	cd := tcclient.ConnectionData(*myScheduler)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task-graph/"+url.QueryEscape(taskGraphId)+"/inspect/"+url.QueryEscape(taskId), new(InspectTaskGraphTaskResponse), nil)
	return responseObject.(*InspectTaskGraphTaskResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See https://docs.taskcluster.net/reference/platform/scheduler/api-docs#ping
func (myScheduler *Scheduler) Ping() error {
	cd := tcclient.ConnectionData(*myScheduler)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
