// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run `go generate` in the
// clients/client-go/codegenerator/model subdirectory of the
// taskcluster git repository.

// This package was generated from the reference schema of
// the WebServer service, which is also published here:
//
//   * ${TASKCLUSTER_ROOT_URL}/references/web-server/v1/api.json
//
// where ${TASKCLUSTER_ROOT_URL} points to the root URL of
// your taskcluster deployment.

// The web-server service provides a GraphQL gateway to Taskcluster APIs,
// as well as profiler endpoints that generate Firefox Profiler–compatible
// profiles from task group metadata and task logs.
//
// See:
//
// # How to use this package
//
// First create a WebServer object:
//
//	webServer := tcwebserver.New(nil)
//
// and then call one or more of webServer's methods, e.g.:
//
//	err := webServer.Ping(.....)
//
// handling any errors...
//
//	if err != nil {
//		// handle error...
//	}
//
// # Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// <rootUrl>/references/web-server/v1/api.json together with the input and output schemas it references,
package tcwebserver

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
)

type WebServer tcclient.Client

// New returns a WebServer client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//	webServer := tcwebserver.New(
//	    nil,                                      // client without authentication
//	    "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//	)
//	err := webServer.Ping(.....)                  // for example, call the Ping(.....) API endpoint (described further down)...
//	if err != nil {
//		// handle errors...
//	}
func New(credentials *tcclient.Credentials, rootURL string) *WebServer {
	return &WebServer{
		Credentials:  credentials,
		RootURL:      rootURL,
		ServiceName:  "web-server",
		APIVersion:   "v1",
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns a *WebServer configured from environment variables.
//
// The root URL is taken from TASKCLUSTER_PROXY_URL if set to a non-empty
// string, otherwise from TASKCLUSTER_ROOT_URL if set, otherwise the empty
// string.
//
// The credentials are taken from environment variables:
//
//	TASKCLUSTER_CLIENT_ID
//	TASKCLUSTER_ACCESS_TOKEN
//	TASKCLUSTER_CERTIFICATE
//
// If TASKCLUSTER_CLIENT_ID is empty/unset, authentication will be
// disabled.
func NewFromEnv() *WebServer {
	c := tcclient.CredentialsFromEnvVars()
	rootURL := tcclient.RootURLFromEnvVars()
	return &WebServer{
		Credentials:  c,
		RootURL:      rootURL,
		ServiceName:  "web-server",
		APIVersion:   "v1",
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (webServer *WebServer) Ping() error {
	cd := tcclient.Client(*webServer)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #lbheartbeat
func (webServer *WebServer) Lbheartbeat() error {
	cd := tcclient.Client(*webServer)
	_, _, err := (&cd).APICall(nil, "GET", "/__lbheartbeat__", nil, nil)
	return err
}

// Respond with the JSON version object.
// https://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md
//
// See #version
func (webServer *WebServer) Version() error {
	cd := tcclient.Client(*webServer)
	_, _, err := (&cd).APICall(nil, "GET", "/__version__", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Generate a Firefox Profiler–compatible profile from a task group.
// The profile contains scheduling and execution timing for all tasks.
//
// See #taskGroupProfile
func (webServer *WebServer) TaskGroupProfile(taskGroupId string) error {
	cd := tcclient.Client(*webServer)
	_, _, err := (&cd).APICall(nil, "GET", "/task-group/"+url.PathEscape(taskGroupId)+"/profile", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Generate a Firefox Profiler–compatible profile from a task's log output.
// Parses `public/logs/live.log` (or `live_backing.log`) for timing data.
//
// See #taskProfile
func (webServer *WebServer) TaskProfile(taskId string) error {
	cd := tcclient.Client(*webServer)
	_, _, err := (&cd).APICall(nil, "GET", "/task/"+url.PathEscape(taskId)+"/profile", nil, nil)
	return err
}

// Respond with a service heartbeat.
//
// This endpoint is used to check on backing services this service
// depends on.
//
// See #heartbeat
func (webServer *WebServer) Heartbeat() error {
	cd := tcclient.Client(*webServer)
	_, _, err := (&cd).APICall(nil, "GET", "/__heartbeat__", nil, nil)
	return err
}
