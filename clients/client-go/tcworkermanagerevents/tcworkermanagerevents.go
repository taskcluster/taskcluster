// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate

// This package was generated from the schema defined at
// /references/worker-manager/v1/exchanges.json
// These exchanges provide notifications when a worker pool is created or updated.This is so that the provisioner running in a differentprocess at the other end can synchronize to the changes. But you are ofcourse welcome to use these for other purposes, monitoring changes for example.
//
// See:
//
// How to use this package
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
//  pulse.Bind(
//  	"*.*.*.*.*.*.gaia.#",
//  	"exchange/taskcluster-queue/v1/task-defined",
//  )
//
// You can rather use:
//
//  queueevents.TaskDefined{WorkerType: "gaia"}
//
// In addition, this means that you will also get objects in your callback method like *queueevents.TaskDefinedMessage
// rather than just interface{}.
package tcworkermanagerevents

import (
	"reflect"
	"strings"
)

// Whenever the api receives a request to create aworker pool, a message is posted to this exchange anda provider can act upon it.
//
// See #workerPoolCreated
type WorkerPoolCreated struct {
	RoutingKeyKind string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (binding WorkerPoolCreated) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding WorkerPoolCreated) ExchangeName() string {
	return "exchange/taskcluster-worker-manager/v1/worker-pool-created"
}

func (binding WorkerPoolCreated) NewPayloadObject() interface{} {
	return new(WorkerTypePulseMessage)
}

// Whenever the api receives a request to update aworker pool, a message is posted to this exchange anda provider can act upon it.
//
// See #workerPoolUpdated
type WorkerPoolUpdated struct {
	RoutingKeyKind string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (binding WorkerPoolUpdated) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding WorkerPoolUpdated) ExchangeName() string {
	return "exchange/taskcluster-worker-manager/v1/worker-pool-updated"
}

func (binding WorkerPoolUpdated) NewPayloadObject() interface{} {
	return new(WorkerTypePulseMessage)
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
