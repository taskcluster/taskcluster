// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://taskcluster-staging.net/references/events/v1/api.json

// This service is responsible for making pulse messages accessible
// from browsers and cli. There are API endpoints to
// bind / unbind to an exchange and pause / resume listening from a queue
//
// See:
//
// How to use this package
//
// First create an Events object:
//
//  events := tcevents.New(nil)
//
// and then call one or more of events's methods, e.g.:
//
//  err := events.Ping(.....)
//
// handling any errors...
//
//  if err != nil {
//  	// handle error...
//  }
//
// Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// https://taskcluster-staging.net/references/events/v1/api.json together with the input and output schemas it references, downloaded on
// Tue, 29 Jan 2019 at 08:22:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package tcevents

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type Events tcclient.Client

// New returns an Events client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  events := tcevents.New(
//      nil,                                      // client without authentication
//      "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//  )
//  err := events.Ping(.....)                     // for example, call the Ping(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials, rootURL string) *Events {
	return &Events{
		Credentials:  credentials,
		BaseURL:      tcclient.BaseURL(rootURL, "events", "v1"),
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns an *Events configured from environment variables.
//
// The root URL is taken from TASKCLUSTER_PROXY_URL if set to a non-empty
// string, otherwise from TASKCLUSTER_ROOT_URL if set, otherwise the empty
// string.
//
// The credentials are taken from environment variables:
//
//  TASKCLUSTER_CLIENT_ID
//  TASKCLUSTER_ACCESS_TOKEN
//  TASKCLUSTER_CERTIFICATE
//
// If TASKCLUSTER_CLIENT_ID is empty/unset, authentication will be
// disabled.
func NewFromEnv() *Events {
	c := tcclient.CredentialsFromEnvVars()
	return &Events{
		Credentials:  c,
		BaseURL:      tcclient.BaseURL(tcclient.RootURLFromEnvVars(), "events", "v1"),
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (events *Events) Ping() error {
	cd := tcclient.Client(*events)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Connect to receive messages
//
// See #connect
func (events *Events) Connect(bindings string) error {
	v := url.Values{}
	if bindings != "" {
		v.Add("bindings", bindings)
	}
	cd := tcclient.Client(*events)
	_, _, err := (&cd).APICall(nil, "GET", "/connect/", nil, v)
	return err
}
