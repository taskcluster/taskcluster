// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run `go generate` in the
// clients/client-go/codegenerator/model subdirectory of the
// taskcluster git repository.

// This package was generated from the reference schema of
// the WorkerManagerEvents service, which is also published here:
//
//   * ${TASKCLUSTER_ROOT_URL}/references/worker-manager/v1/exchanges.json
//
// where ${TASKCLUSTER_ROOT_URL} points to the root URL of
// your taskcluster deployment.

// These exchanges provide notifications when a worker pool is created or updated.This is so that the provisioner running in a differentprocess at the other end can synchronize to the changes. But you are ofcourse welcome to use these for other purposes, monitoring changes for example.
//
// See:
//
// # How to use this package
//
// This package is designed to sit on top of https://pkg.go.dev/github.com/taskcluster/pulse-go/pulse. Please read
// the pulse package overview to get an understanding of how the pulse client is implemented in go.
//
// This package provides two things in addition to the basic pulse package: structured types for unmarshaling
// pulse message bodies into, and custom Binding interfaces, for defining the fixed strings for task cluster
// exchange names, and routing keys as structured types.
//
// For example, when specifying a binding, rather than using:
//
//	pulse.Bind(
//		"*.*.*.*.*.*.gaia.#",
//		"exchange/taskcluster-queue/v1/task-defined",
//	)
//
// You can rather use:
//
//	queueevents.TaskDefined{WorkerType: "gaia"}
//
// In addition, this means that you will also get objects in your callback method like *queueevents.TaskDefinedMessage
// rather than just any.
package tcworkermanagerevents

import (
	"reflect"
	"strings"
)

// Whenever the api receives a request to create a
// worker pool, a message is posted to this exchange and
// a provider can act upon it.
//
// See #workerPoolCreated
type WorkerPoolCreated struct {
	RoutingKeyKind string `mwords:"*"`
	ProviderID     string `mwords:"*"`
	ProvisionerID  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerID       string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (binding WorkerPoolCreated) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding WorkerPoolCreated) ExchangeName() string {
	return "exchange/taskcluster-worker-manager/v1/worker-pool-created"
}

func (binding WorkerPoolCreated) NewPayloadObject() any {
	return new(WorkerTypePulseMessage)
}

// Whenever the api receives a request to update a
// worker pool, a message is posted to this exchange and
// a provider can act upon it.
//
// See #workerPoolUpdated
type WorkerPoolUpdated struct {
	RoutingKeyKind string `mwords:"*"`
	ProviderID     string `mwords:"*"`
	ProvisionerID  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerID       string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (binding WorkerPoolUpdated) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding WorkerPoolUpdated) ExchangeName() string {
	return "exchange/taskcluster-worker-manager/v1/worker-pool-updated"
}

func (binding WorkerPoolUpdated) NewPayloadObject() any {
	return new(WorkerTypePulseMessage)
}

// Whenever a worker reports an error
// or provisioner encounters an error while
// provisioning a worker pool, a message is posted to this
// exchange.
//
// See #workerPoolError
type WorkerPoolError struct {
	RoutingKeyKind string `mwords:"*"`
	ProviderID     string `mwords:"*"`
	ProvisionerID  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerID       string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (binding WorkerPoolError) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding WorkerPoolError) ExchangeName() string {
	return "exchange/taskcluster-worker-manager/v1/worker-pool-error"
}

func (binding WorkerPoolError) NewPayloadObject() any {
	return new(WorkerTypePulseMessage1)
}

// Whenever a worker is requested, a message is posted
// to this exchange.
//
// See #workerRequested
type WorkerRequested struct {
	RoutingKeyKind string `mwords:"*"`
	ProviderID     string `mwords:"*"`
	ProvisionerID  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerID       string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (binding WorkerRequested) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding WorkerRequested) ExchangeName() string {
	return "exchange/taskcluster-worker-manager/v1/worker-requested"
}

func (binding WorkerRequested) NewPayloadObject() any {
	return new(WorkerPulseMessage)
}

// Whenever a worker has registered, a message is posted
// to this exchange. This means that worker started
// successfully and is ready to claim work.
//
// See #workerRunning
type WorkerRunning struct {
	RoutingKeyKind string `mwords:"*"`
	ProviderID     string `mwords:"*"`
	ProvisionerID  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerID       string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (binding WorkerRunning) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding WorkerRunning) ExchangeName() string {
	return "exchange/taskcluster-worker-manager/v1/worker-running"
}

func (binding WorkerRunning) NewPayloadObject() any {
	return new(WorkerPulseMessage)
}

// Whenever a worker has stopped, a message is posted
// to this exchange. This means that instance was
// either terminated or stopped gracefully.
//
// See #workerStopped
type WorkerStopped struct {
	RoutingKeyKind string `mwords:"*"`
	ProviderID     string `mwords:"*"`
	ProvisionerID  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerID       string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (binding WorkerStopped) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding WorkerStopped) ExchangeName() string {
	return "exchange/taskcluster-worker-manager/v1/worker-stopped"
}

func (binding WorkerStopped) NewPayloadObject() any {
	return new(WorkerPulseMessage)
}

// Whenever a worker is removed, a message is posted to this exchange.
// This occurs when a worker is requested to be removed via an API call
// or when a worker is terminated by the worker manager.
// The reason for the removal is included in the message.
//
// See #workerRemoved
type WorkerRemoved struct {
	RoutingKeyKind string `mwords:"*"`
	ProviderID     string `mwords:"*"`
	ProvisionerID  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerID       string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (binding WorkerRemoved) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding WorkerRemoved) ExchangeName() string {
	return "exchange/taskcluster-worker-manager/v1/worker-removed"
}

func (binding WorkerRemoved) NewPayloadObject() any {
	return new(WorkerRemovedPulseMessage)
}

func generateRoutingKey(x any) string {
	val := reflect.ValueOf(x).Elem()
	p := make([]string, 0, val.NumField())
	for i := range val.NumField() {
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
