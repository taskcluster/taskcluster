// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://taskcluster-staging.net/references/auth/v1/exchanges.json

// The auth service is responsible for storing credentials, managing
// assignment of scopes, and validation of request signatures from other
// services.
//
// These exchanges provides notifications when credentials or roles are
// updated. This is mostly so that multiple instances of the auth service
// can purge their caches and synchronize state. But you are of course
// welcome to use these for other purposes, monitoring changes for example.
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
package tcauthevents

import (
	"reflect"
	"strings"
)

// Message that a new client has been created.
//
// See #clientCreated
type ClientCreated struct {
	Reserved string `mwords:"#"`
}

func (binding ClientCreated) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding ClientCreated) ExchangeName() string {
	return "exchange/taskcluster-auth/v1/client-created"
}

func (binding ClientCreated) NewPayloadObject() interface{} {
	return new(ClientMessage)
}

// Message that a new client has been updated.
//
// See #clientUpdated
type ClientUpdated struct {
	Reserved string `mwords:"#"`
}

func (binding ClientUpdated) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding ClientUpdated) ExchangeName() string {
	return "exchange/taskcluster-auth/v1/client-updated"
}

func (binding ClientUpdated) NewPayloadObject() interface{} {
	return new(ClientMessage)
}

// Message that a new client has been deleted.
//
// See #clientDeleted
type ClientDeleted struct {
	Reserved string `mwords:"#"`
}

func (binding ClientDeleted) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding ClientDeleted) ExchangeName() string {
	return "exchange/taskcluster-auth/v1/client-deleted"
}

func (binding ClientDeleted) NewPayloadObject() interface{} {
	return new(ClientMessage)
}

// Message that a new role has been created.
//
// See #roleCreated
type RoleCreated struct {
	Reserved string `mwords:"#"`
}

func (binding RoleCreated) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding RoleCreated) ExchangeName() string {
	return "exchange/taskcluster-auth/v1/role-created"
}

func (binding RoleCreated) NewPayloadObject() interface{} {
	return new(RoleMessage)
}

// Message that a new role has been updated.
//
// See #roleUpdated
type RoleUpdated struct {
	Reserved string `mwords:"#"`
}

func (binding RoleUpdated) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding RoleUpdated) ExchangeName() string {
	return "exchange/taskcluster-auth/v1/role-updated"
}

func (binding RoleUpdated) NewPayloadObject() interface{} {
	return new(RoleMessage)
}

// Message that a new role has been deleted.
//
// See #roleDeleted
type RoleDeleted struct {
	Reserved string `mwords:"#"`
}

func (binding RoleDeleted) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding RoleDeleted) ExchangeName() string {
	return "exchange/taskcluster-auth/v1/role-deleted"
}

func (binding RoleDeleted) NewPayloadObject() interface{} {
	return new(RoleMessage)
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
