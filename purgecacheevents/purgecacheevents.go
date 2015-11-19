// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/purge-cache/v1/exchanges.json

// The purge-cache service, typically available at
// `purge-cache.taskcluster.net`, is responsible for publishing a pulse
// message for workers, so they can purge cache upon request.
//
// This document describes the exchange offered for workers by the
// cache-purge service.
//
// See: http://docs.taskcluster.net/services/purge-cache
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
//  	"exchange/taskcluster-queue/v1/task-defined")
//
// You can rather use:
//
//  queueevents.TaskDefined{WorkerType: "gaia"}
//
// In addition, this means that you will also get objects in your callback method like *queueevents.TaskDefinedMessage
// rather than just interface{}.
package purgecacheevents

import (
	"errors"
	"reflect"
	"strings"
	"time"
)

// When a cache purge is requested  a message will be posted on this
// exchange with designated `provisionerId` and `workerType` in the
// routing-key and the name of the `cacheFolder` as payload
//
// See http://docs.taskcluster.net/services/purge-cache/#purgeCache
type PurgeCache struct {
	RoutingKeyKind string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
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

type (

	// Message reporting that a specific cache should be purged
	//
	// See http://schemas.taskcluster.net/purge-cache/v1/purge-cache-message.json#
	PurgeCacheMessage struct {

		// Name of cache to purge. Notice that if a `workerType` have multiple kinds
		// of caches (with independent names), it should purge all caches identified
		// by `cacheName` regardless of cache type.
		//
		// See http://schemas.taskcluster.net/purge-cache/v1/purge-cache-message.json#/properties/cacheName
		CacheName string `json:"cacheName"`

		// `provisionerId` under which the `workerType` we want to purge for exists.
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/purge-cache/v1/purge-cache-message.json#/properties/provisionerId
		ProvisionerId string `json:"provisionerId"`

		// Message version
		//
		// Possible values:
		//   * 1
		//
		// See http://schemas.taskcluster.net/purge-cache/v1/purge-cache-message.json#/properties/version
		Version int `json:"version"`

		// `workerType` we wish to purge cache for.
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 22
		//
		// See http://schemas.taskcluster.net/purge-cache/v1/purge-cache-message.json#/properties/workerType
		WorkerType string `json:"workerType"`
	}
)

// Wraps time.Time in order that json serialisation/deserialisation can be adapted.
// Marshaling time.Time types results in RFC3339 dates with nanosecond precision
// in the user's timezone. In order that the json date representation is consistent
// between what we send in json payloads, and what taskcluster services return,
// we wrap time.Time into type purgecacheevents.Time which marshals instead
// to the same format used by the TaskCluster services; UTC based, with millisecond
// precision, using 'Z' timezone, e.g. 2015-10-27T20:36:19.255Z.
type Time time.Time

// MarshalJSON implements the json.Marshaler interface.
// The time is a quoted string in RFC 3339 format, with sub-second precision added if present.
func (t Time) MarshalJSON() ([]byte, error) {
	if y := time.Time(t).Year(); y < 0 || y >= 10000 {
		// RFC 3339 is clear that years are 4 digits exactly.
		// See golang.org/issue/4556#c15 for more discussion.
		return nil, errors.New("queue.Time.MarshalJSON: year outside of range [0,9999]")
	}
	return []byte(`"` + t.String() + `"`), nil
}

// UnmarshalJSON implements the json.Unmarshaler interface.
// The time is expected to be a quoted string in RFC 3339 format.
func (t *Time) UnmarshalJSON(data []byte) (err error) {
	// Fractional seconds are handled implicitly by Parse.
	x := new(time.Time)
	*x, err = time.Parse(`"`+time.RFC3339+`"`, string(data))
	*t = Time(*x)
	return
}

// Returns the Time in canonical RFC3339 representation, e.g.
// 2015-10-27T20:36:19.255Z
func (t Time) String() string {
	return time.Time(t).UTC().Format("2006-01-02T15:04:05.000Z")
}
