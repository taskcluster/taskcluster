// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/scheduler/v1/exchanges.json

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
//
// See: http://docs.taskcluster.net/scheduler/events
//
// How to use this package
//
// This package is designed to sit on top of http://godoc.org/github.com/petemoore/pulse-go/pulse. Please read
// the pulse package overview to get an understanding of how the pulse client is implemented in go.
//
// This package provides two things in addition to the basic pulse package: structured types for unmarshaling
// pulse message bodies into, and custom Binding interfaces, for defining the fixed strings for task cluster
// exchange names, and routing keys as structured types.
//
// For example, when specifying a binding, rather than using:
//
//  pulse.Bind(
//  	"*.*.*.*.*.*.gaia.#",
//  	"exchange/taskcluster-queue/v1/task-defined")
//
// You can rather use:
//
//  queueevents.TaskDefined{WorkerType: "gaia"}
//
// In addition, this means that you will also get objects in your callback method like *queueevents.TaskDefinedMessage
// rather than just interface{}.
package schedulerevents

import (
	"encoding/json"
	"reflect"
	"strings"
)

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

func (binding TaskGraphRunning) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding TaskGraphRunning) ExchangeName() string {
	return "exchange/taskcluster-scheduler/v1/task-graph-running"
}

func (binding TaskGraphRunning) NewPayloadObject() interface{} {
	return new(NewTaskGraphMessage)
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

func (binding TaskGraphExtended) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding TaskGraphExtended) ExchangeName() string {
	return "exchange/taskcluster-scheduler/v1/task-graph-extended"
}

func (binding TaskGraphExtended) NewPayloadObject() interface{} {
	return new(TaskGraphExtendedMessage)
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

func (binding TaskGraphBlocked) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding TaskGraphBlocked) ExchangeName() string {
	return "exchange/taskcluster-scheduler/v1/task-graph-blocked"
}

func (binding TaskGraphBlocked) NewPayloadObject() interface{} {
	return new(BlockedTaskGraphMessage)
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

func (binding TaskGraphFinished) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding TaskGraphFinished) ExchangeName() string {
	return "exchange/taskcluster-scheduler/v1/task-graph-finished"
}

func (binding TaskGraphFinished) NewPayloadObject() interface{} {
	return new(TaskGraphFinishedMessage)
}

func generateRoutingKey(x interface{}) string {
	val := reflect.ValueOf(x).Elem()
	p := make([]string, 0, val.NumField())
	for i := 0; i < val.NumField(); i++ {
		valueField := val.Field(i)
		typeField := val.Type().Field(i)
		tag := typeField.Tag
		if t := tag.Get("mwords"); t != "" {
			if v := valueField.Interface(); v == "" {
				p = append(p, t)
			} else {
				p = append(p, v.(string))
			}
		}
	}
	return strings.Join(p, ".")
}

type (
	// Message that all reruns of a task has failed it is now blocking the task-graph from finishing.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-blocked-message.json#
	BlockedTaskGraphMessage struct {
		Status TaskGraphStatusStructure `json:"status"`
		// Unique `taskId` that is blocking this task-graph from completion.
		TaskId string `json:"taskId"`
		// Message version
		Version json.RawMessage `json:"version"`
	}

	// Messages as posted to `scheduler/v1/task-graph-extended` informing the world that a task-graph have been extended.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-extended-message.json#
	TaskGraphExtendedMessage struct {
		Status TaskGraphStatusStructure `json:"status"`
		// Message version
		Version json.RawMessage `json:"version"`
	}

	// Message that all tasks in a task-graph have now completed successfully and the graph is _finished_.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-finished-message.json#
	TaskGraphFinishedMessage struct {
		Status TaskGraphStatusStructure `json:"status"`
		// Message version
		Version json.RawMessage `json:"version"`
	}

	// Messages as posted to `scheduler/v1/task-graph-running` informing the world that a new task-graph have been submitted.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-running-message.json#
	NewTaskGraphMessage struct {
		Status TaskGraphStatusStructure `json:"status"`
		// Message version
		Version json.RawMessage `json:"version"`
	}

	// A representation of **task-graph status** as known by the scheduler, without the state of all individual tasks.
	//
	// See http://schemas.taskcluster.net/scheduler/v1/task-graph-status.json#
	TaskGraphStatusStructure struct {
		// Unique identifier for task-graph scheduler managing the given task-graph
		SchedulerId string `json:"schedulerId"`
		// Task-graph state, this enum is **frozen** new values will **not** be added.
		State json.RawMessage `json:"state"`
		// Unique task-graph identifier, this is UUID encoded as [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and stripped of `=` padding.
		TaskGraphId string `json:"taskGraphId"`
	}
)
