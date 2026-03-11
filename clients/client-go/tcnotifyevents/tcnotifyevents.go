// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run `go generate` in the
// clients/client-go/codegenerator/model subdirectory of the
// taskcluster git repository.

// This package was generated from the reference schema of
// the NotifyEvents service, which is also published here:
//
//   * ${TASKCLUSTER_ROOT_URL}/references/notify/v1/exchanges.json
//
// where ${TASKCLUSTER_ROOT_URL} points to the root URL of
// your taskcluster deployment.

// This pretty much only contains the simple free-form
// message that can be published from this service from a request
// by anybody with the proper scopes.
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
	Topic          string `mwords:"#"`
}

func (binding Notify) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding Notify) ExchangeName() string {
	return "exchange/taskcluster-notify/v1/notification"
}

func (binding Notify) NewPayloadObject() any {
	return new(NotificationMessage)
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
