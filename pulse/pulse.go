// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/pulse/v1/api.json

// The taskcluster-pulse service, typically available at `pulse.taskcluster.net`
// manages pulse credentials for taskcluster users.
//
// A service to manage Pulse credentials for anything using
// Taskcluster credentials. This allows us self-service and
// greater control within the Taskcluster project.
//
// See: https://docs.do.not.exist.yet.service.not.in.production
//
// How to use this package
//
// First create a Pulse object:
//
//  myPulse := pulse.New(&tcclient.Credentials{ClientId: "myClientId", AccessToken: "myAccessToken"})
//
// and then call one or more of myPulse's methods, e.g.:
//
//  err := myPulse.Ping(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/pulse/v1/api.json together with the input and output schemas it references, downloaded on
// Tue, 18 Oct 2016 at 18:25:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package pulse

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type Pulse tcclient.ConnectionData

// Returns a pointer to Pulse, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false (in which case creds is
// ignored).
//
// For example:
//  creds := &tcclient.Credentials{
//  	ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
//  	AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
//  	Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
//  }
//  myPulse := pulse.New(creds)                              // set credentials
//  myPulse.Authenticate = false                             // disable authentication (creds above are now ignored)
//  myPulse.BaseURL = "http://localhost:1234/api/Pulse/v1"   // alternative API endpoint (production by default)
//  err := myPulse.Ping(.....)                               // for example, call the Ping(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Pulse {
	myPulse := Pulse(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://pulse.taskcluster.net/v1",
		Authenticate: true,
	})
	return &myPulse
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See https://docs.do.not.exist.yet.service.not.in.production#ping
func (myPulse *Pulse) Ping() error {
	cd := tcclient.ConnectionData(*myPulse)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// An overview of the Rabbit cluster
//
// **Warning** this api end-point is **not stable**.
//
// See https://docs.do.not.exist.yet.service.not.in.production#overview
func (myPulse *Pulse) Overview() (*RabbitOverviewResponse, error) {
	cd := tcclient.ConnectionData(*myPulse)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/overview", new(RabbitOverviewResponse), nil)
	return responseObject.(*RabbitOverviewResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Creates a namespace, given the taskcluster credentials with scopes.
//
// **Warning** this api end-point is **not stable**.
//
// Required scopes:
//   * pulse:namespace:<namespace>
//
// See https://docs.do.not.exist.yet.service.not.in.production#namespace
func (myPulse *Pulse) Namespace(namespace string, payload *NamespaceCreationRequest) error {
	cd := tcclient.ConnectionData(*myPulse)
	_, _, err := (&cd).APICall(payload, "POST", "/namespace/"+url.QueryEscape(namespace), nil, nil)
	return err
}
