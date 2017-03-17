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
//  myPulse := pulse.New(&tcclient.Credentials{ClientID: "myClientID", AccessToken: "myAccessToken"})
//
// and then call one or more of myPulse's methods, e.g.:
//
//  data, err := myPulse.Overview(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/pulse/v1/api.json together with the input and output schemas it references, downloaded on
// Fri, 17 Mar 2017 at 00:22:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package pulse

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type Pulse tcclient.Client

// Returns a pointer to Pulse, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false (in which case creds is
// ignored).
//
// For example:
//  creds := &tcclient.Credentials{
//  	ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
//  	AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
//  	Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
//  }
//  myPulse := pulse.New(creds)                              // set credentials
//  myPulse.Authenticate = false                             // disable authentication (creds above are now ignored)
//  myPulse.BaseURL = "http://localhost:1234/api/Pulse/v1"   // alternative API endpoint (production by default)
//  data, err := myPulse.Overview(.....)                     // for example, call the Overview(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Pulse {
	myPulse := Pulse(tcclient.Client{
		Credentials:  credentials,
		BaseURL:      "https://pulse.taskcluster.net/v1",
		Authenticate: true,
	})
	return &myPulse
}

// Stability: *** EXPERIMENTAL ***
//
// An overview of the Rabbit cluster
//
// See https://docs.do.not.exist.yet.service.not.in.production#overview
func (myPulse *Pulse) Overview() (*RabbitOverviewResponse, error) {
	cd := tcclient.Client(*myPulse)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/overview", new(RabbitOverviewResponse), nil)
	return responseObject.(*RabbitOverviewResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// A list of exchanges in the rabbit cluster
//
// See https://docs.do.not.exist.yet.service.not.in.production#exchanges
func (myPulse *Pulse) Exchanges() (*RabbitMQExchanges, error) {
	cd := tcclient.Client(*myPulse)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/exchanges", new(RabbitMQExchanges), nil)
	return responseObject.(*RabbitMQExchanges), err
}

// Stability: *** EXPERIMENTAL ***
//
// Creates a namespace, given the taskcluster credentials with scopes.
//
// Required scopes:
//   * pulse:namespace:<namespace>
//
// See https://docs.do.not.exist.yet.service.not.in.production#createNamespace
func (myPulse *Pulse) CreateNamespace(namespace string, payload *NamespaceCreationRequest) (*NamespaceCreationResponse, error) {
	cd := tcclient.Client(*myPulse)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/namespace/"+url.QueryEscape(namespace), new(NamespaceCreationResponse), nil)
	return responseObject.(*NamespaceCreationResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Gets a namespace, given the taskcluster credentials with scopes.
//
// Required scopes:
//   * pulse:namespace:<namespace>
//
// See https://docs.do.not.exist.yet.service.not.in.production#namespace
func (myPulse *Pulse) Namespace(namespace string) error {
	cd := tcclient.Client(*myPulse)
	_, _, err := (&cd).APICall(nil, "GET", "/namespace/"+url.QueryEscape(namespace), nil, nil)
	return err
}

// Returns a signed URL for Namespace, valid for the specified duration.
//
// Required scopes:
//   * pulse:namespace:<namespace>
//
// See Namespace for more details.
func (myPulse *Pulse) Namespace_SignedURL(namespace string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*myPulse)
	return (&cd).SignedURL("/namespace/"+url.QueryEscape(namespace), nil, duration)
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See https://docs.do.not.exist.yet.service.not.in.production#ping
func (myPulse *Pulse) Ping() error {
	cd := tcclient.Client(*myPulse)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
