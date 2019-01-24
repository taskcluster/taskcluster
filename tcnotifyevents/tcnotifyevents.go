// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://taskcluster-staging.net/references/notify/v1/exchanges.json

// This pretty much only contains the simple free-form
// message that can be published from this service from a request
// by anybody with the proper scopes.
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
package tcnotifyevents

import (
	"reflect"
	"strings"
)

// An arbitrary message that a taskcluster user
// can trigger if they like.
//
// The standard one that is published by us watching
// for the completion of tasks is just the task status
// data that we pull from the queue `status()` endpoint
// when we notice a task is complete.
//
// See #notify
type Notify struct {
	RoutingKeyKind string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

func (binding Notify) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding Notify) ExchangeName() string {
	return "exchange/taskcluster-notify/v1/notification"
}

func (binding Notify) NewPayloadObject() interface{} {
	return new(NotificationMessage)
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
