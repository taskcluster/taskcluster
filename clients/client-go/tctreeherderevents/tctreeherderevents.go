// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://taskcluster-staging.net/references/treeherder/v1/exchanges.json

// The taskcluster-treeherder service is responsible for processing
// task events published by Taskcluster Queue and producing job messages
// that are consumable by Treeherder.
//
// This exchange provides that job messages to be consumed by any queue that
// attached to the exchange.  This could be a production Treeheder instance,
// a local development environment, or a custom dashboard.
//
// See:
//
// How to use this package
//
// This package is designed to sit on top of http://godoc.org/github.com/taskcluster/pulse-go/pulse. Please read
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
package tctreeherderevents

import (
	"reflect"
	"strings"
)

// When a task run is scheduled or resolved, a message is posted to
// this exchange in a Treeherder consumable format.
//
// See #jobs
type Jobs struct {
	Destination string `mwords:"*"`
	Project     string `mwords:"*"`
	Reserved    string `mwords:"#"`
}

func (binding Jobs) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding Jobs) ExchangeName() string {
	return "exchange/taskcluster-treeherder/v1/jobs"
}

func (binding Jobs) NewPayloadObject() interface{} {
	return new(JobDefinition)
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
