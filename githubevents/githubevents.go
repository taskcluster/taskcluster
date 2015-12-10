// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/github/v1/exchanges.json

// The github service, typically available at
// `github.taskcluster.net`, is responsible for publishing a pulse
// message for supported github events.
//
// This document describes the exchange offered by the taskcluster
// github service
//
// See: http://docs.taskcluster.net/services/taskcluster-github
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
package githubevents

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"time"
)

// When a GitHub pull request event is posted it will be broadcast on this
// exchange with the designated `organization` and `repository`
// in the routing-key along with event specific metadata in the payload.
//
// See http://docs.taskcluster.net/services/taskcluster-github/#pullRequest
type PullRequest struct {
	RoutingKeyKind string `mwords:"*"`
	Organization   string `mwords:"*"`
	Repository     string `mwords:"*"`
	Action         string `mwords:"*"`
}

func (binding PullRequest) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding PullRequest) ExchangeName() string {
	return "exchange/taskcluster-github/v1/pull-request"
}

func (binding PullRequest) NewPayloadObject() interface{} {
	return new(GitHubPullRequestMessage)
}

// When a GitHub push event is posted it will be broadcast on this
// exchange with the designated `organization` and `repository`
// in the routing-key along with event specific metadata in the payload.
//
// See http://docs.taskcluster.net/services/taskcluster-github/#push
type Push struct {
	RoutingKeyKind string `mwords:"*"`
	Organization   string `mwords:"*"`
	Repository     string `mwords:"*"`
}

func (binding Push) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding Push) ExchangeName() string {
	return "exchange/taskcluster-github/v1/push"
}

func (binding Push) NewPayloadObject() interface{} {
	return new(GitHubPushMessage)
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

	// Message reporting that a GitHub pull request has occurred
	//
	// See http://schemas.taskcluster.net/github/v1/github-pull-request-message.json#
	GitHubPullRequestMessage struct {

		// The GitHub `action` which triggered an event.
		//
		// Possible values:
		//   * "assigned"
		//   * "unassigned"
		//   * "labeled"
		//   * "unlabeled"
		//   * "opened"
		//   * "closed"
		//   * "reopened"
		//   * "synchronize"
		//
		// See http://schemas.taskcluster.net/github/v1/github-pull-request-message.json#/properties/action
		Action json.RawMessage `json:"action"`

		// Metadata describing the pull request.
		//
		// See http://schemas.taskcluster.net/github/v1/github-pull-request-message.json#/properties/details
		Details json.RawMessage `json:"details"`

		// The GitHub `organization` which had an event.
		//
		// Syntax:     ^([a-zA-Z0-9-_%]*)$
		// Min length: 1
		// Max length: 100
		//
		// See http://schemas.taskcluster.net/github/v1/github-pull-request-message.json#/properties/organization
		Organization string `json:"organization"`

		// The GitHub `repository` which had an event.
		//
		// Syntax:     ^([a-zA-Z0-9-_%]*)$
		// Min length: 1
		// Max length: 100
		//
		// See http://schemas.taskcluster.net/github/v1/github-pull-request-message.json#/properties/repository
		Repository string `json:"repository"`

		// Message version
		//
		// Possible values:
		//   * 1
		//
		// See http://schemas.taskcluster.net/github/v1/github-pull-request-message.json#/properties/version
		Version json.RawMessage `json:"version"`
	}

	// Message reporting that a GitHub push has occurred
	//
	// See http://schemas.taskcluster.net/github/v1/github-push-message.json#
	GitHubPushMessage struct {

		// Metadata describing the push.
		//
		// See http://schemas.taskcluster.net/github/v1/github-push-message.json#/properties/details
		Details json.RawMessage `json:"details"`

		// The GitHub `organization` which had an event.
		//
		// Syntax:     ^([a-zA-Z0-9-_%]*)$
		// Min length: 1
		// Max length: 100
		//
		// See http://schemas.taskcluster.net/github/v1/github-push-message.json#/properties/organization
		Organization string `json:"organization"`

		// The GitHub `repository` which had an event.
		//
		// Syntax:     ^([a-zA-Z0-9-_%]*)$
		// Min length: 1
		// Max length: 100
		//
		// See http://schemas.taskcluster.net/github/v1/github-push-message.json#/properties/repository
		Repository string `json:"repository"`

		// Message version
		//
		// Possible values:
		//   * 1
		//
		// See http://schemas.taskcluster.net/github/v1/github-push-message.json#/properties/version
		Version json.RawMessage `json:"version"`
	}
)

// Wraps time.Time in order that json serialisation/deserialisation can be adapted.
// Marshaling time.Time types results in RFC3339 dates with nanosecond precision
// in the user's timezone. In order that the json date representation is consistent
// between what we send in json payloads, and what taskcluster services return,
// we wrap time.Time into type githubevents.Time which marshals instead
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
