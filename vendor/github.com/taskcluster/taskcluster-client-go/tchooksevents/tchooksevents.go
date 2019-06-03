// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://taskcluster-staging.net/references/hooks/v1/exchanges.json

// The hooks service is responsible for creating tasks at specific times orin .  response to webhooks and API calls.Using this exchange allows us tomake hooks which repsond to particular pulse messagesThese exchanges provide notifications when a hook is created, updatedor deleted. This is so that the listener running in a different hooks process at the other end can direct another listener specified by`hookGroupId` and `hookId` to synchronize its bindings. But you are ofcourse welcome to use these for other purposes, monitoring changes for example.
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
package tchooksevents

import (
	"reflect"
	"strings"
)

// Whenever the api receives a request to create apulse based hook, a message is posted to this exchange andthe receiver creates a listener with the bindings, to create a task
//
// See #hookCreated
type HookCreated struct {
	Reserved string `mwords:"#"`
}

func (binding HookCreated) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding HookCreated) ExchangeName() string {
	return "exchange/taskcluster-hooks/v1/hook-created"
}

func (binding HookCreated) NewPayloadObject() interface{} {
	return new(HookChangedMessage)
}

// Whenever the api receives a request to update apulse based hook, a message is posted to this exchange andthe receiver updates the listener associated with that hook.
//
// See #hookUpdated
type HookUpdated struct {
	Reserved string `mwords:"#"`
}

func (binding HookUpdated) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding HookUpdated) ExchangeName() string {
	return "exchange/taskcluster-hooks/v1/hook-updated"
}

func (binding HookUpdated) NewPayloadObject() interface{} {
	return new(HookChangedMessage)
}

// Whenever the api receives a request to delete apulse based hook, a message is posted to this exchange andthe receiver deletes the listener associated with that hook.
//
// See #hookDeleted
type HookDeleted struct {
	Reserved string `mwords:"#"`
}

func (binding HookDeleted) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding HookDeleted) ExchangeName() string {
	return "exchange/taskcluster-hooks/v1/hook-deleted"
}

func (binding HookDeleted) NewPayloadObject() interface{} {
	return new(HookChangedMessage)
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
