// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run `go generate` in the
// clients/client-go/codegenerator/model subdirectory of the
// taskcluster git repository.

// This package was generated from the reference schema of
// the GithubEvents service, which is also published here:
//
//   * ${TASKCLUSTER_ROOT_URL}/references/github/v1/exchanges.json
//
// where ${TASKCLUSTER_ROOT_URL} points to the root URL of
// your taskcluster deployment.

// The github service publishes a pulse
// message for supported github events, translating Github webhook
// events into pulse messages.
//
// This document describes the exchange offered by the taskcluster
// github service
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
package tcgithubevents

import (
	"reflect"
	"strings"
)

// When a GitHub pull request event is posted it will be broadcast on this
// exchange with the designated `organization` and `repository`
// in the routing-key along with event specific metadata in the payload.
//
// See #pullRequest
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

func (binding PullRequest) NewPayloadObject() any {
	return new(GitHubPullRequestMessage)
}

// When a GitHub push event is posted it will be broadcast on this
// exchange with the designated `organization` and `repository`
// in the routing-key along with event specific metadata in the payload.
//
// See #push
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

func (binding Push) NewPayloadObject() any {
	return new(GitHubPushMessage)
}

// When a GitHub release event is posted it will be broadcast on this
// exchange with the designated `organization` and `repository`
// in the routing-key along with event specific metadata in the payload.
//
// See #release
type Release struct {
	RoutingKeyKind string `mwords:"*"`
	Organization   string `mwords:"*"`
	Repository     string `mwords:"*"`
}

func (binding Release) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding Release) ExchangeName() string {
	return "exchange/taskcluster-github/v1/release"
}

func (binding Release) NewPayloadObject() any {
	return new(GitHubReleaseMessage)
}

// When a GitHub check_run event with action="rerequested" is posted
// it will be broadcast on this exchange with the designated
// `organization` and `repository`
// in the routing-key along with event specific metadata in the payload.
//
// See #rerun
type Rerun struct {
	RoutingKeyKind string `mwords:"*"`
	Organization   string `mwords:"*"`
	Repository     string `mwords:"*"`
}

func (binding Rerun) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding Rerun) ExchangeName() string {
	return "exchange/taskcluster-github/v1/rerun"
}

func (binding Rerun) NewPayloadObject() any {
	return new(GitHubReRunRequestMessage)
}

// supposed to signal that taskCreate API has been called for every task in the task group
// for this particular repo and this particular organization
// currently used for creating initial status indicators in GitHub UI using Statuses API.
// This particular exchange can also be bound to RabbitMQ queues by custom routes - for that,
// Pass in the array of routes as a second argument to the publish method. Currently, we do
// use the statuses routes to bind the handler that creates the initial status.
//
// See #taskGroupCreationRequested
type TaskGroupCreationRequested struct {
	RoutingKeyKind string `mwords:"*"`
	Organization   string `mwords:"*"`
	Repository     string `mwords:"*"`
}

func (binding TaskGroupCreationRequested) RoutingKey() string {
	return generateRoutingKey(&binding)
}

func (binding TaskGroupCreationRequested) ExchangeName() string {
	return "exchange/taskcluster-github/v1/task-group-creation-requested"
}

func (binding TaskGroupCreationRequested) NewPayloadObject() any {
	return new(TaskGroupDefinedCreateStatus)
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
