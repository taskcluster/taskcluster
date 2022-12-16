// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://references.taskcluster.net/purge-cache/v1/exchanges.json

// The purge-cache service, typically available at
// `purge-cache.taskcluster.net`, is responsible for publishing a pulse
// message for workers, so they can purge cache upon request.
//
// This document describes the exchange offered for workers by the
// cache-purge service.
//
// See: https://docs.taskcluster.net/reference/core/purge-cache/exchanges
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
// rather than just interface{}.
package tcpurgecacheevents

import (
	"reflect"
	"strings"
)

// When a cache purge is requested  a message will be posted on this
// exchange with designated `provisionerId` and `workerType` in the
// routing-key and the name of the `cacheFolder` as payload
//
// See https://docs.taskcluster.net/reference/core/purge-cache/exchanges#purgeCache
type PurgeCache struct {
	RoutingKeyKind string `mwords:"*"`
	ProvisionerID  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
}

func (binding PurgeCache) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding PurgeCache) ExchangeName() string {
	return "exchange/taskcluster-purge-cache/v1/purge-cache"
}

func (binding PurgeCache) NewPayloadObject() interface{} {
	return new(PurgeCacheMessage)
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
