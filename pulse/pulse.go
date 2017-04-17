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
// Taskcluster credentials. This allows for self-service pulse
// access and greater control within the Taskcluster project.
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
// Mon, 17 Apr 2017 at 20:26:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package pulse

import (
	"net/url"

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
// Get an overview of the Rabbit cluster.
//
// See https://docs.do.not.exist.yet.service.not.in.production#overview
func (myPulse *Pulse) Overview() (*RabbitOverviewResponse, error) {
	cd := tcclient.Client(*myPulse)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/overview", new(RabbitOverviewResponse), nil)
	return responseObject.(*RabbitOverviewResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Get a list of all exchanges in the rabbit cluster.  This will include exchanges
// not managed by this service, if any exist.
//
// See https://docs.do.not.exist.yet.service.not.in.production#exchanges
func (myPulse *Pulse) Exchanges() (*RabbitMQExchanges, error) {
	cd := tcclient.Client(*myPulse)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/exchanges", new(RabbitMQExchanges), nil)
	return responseObject.(*RabbitMQExchanges), err
}

// Stability: *** EXPERIMENTAL ***
//
// List the namespaces managed by this service.
//
// This will list up to 1000 namespaces. If more namespaces are present a
// `continuationToken` will be returned, which can be given in the next
// request. For the initial request, do not provide continuation.
//
// See https://docs.do.not.exist.yet.service.not.in.production#listNamespaces
func (myPulse *Pulse) ListNamespaces(continuation, limit string) (*ListNamespacesResponse, error) {
	v := url.Values{}
	if continuation != "" {
		v.Add("continuation", continuation)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*myPulse)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/namespaces", new(ListNamespacesResponse), v)
	return responseObject.(*ListNamespacesResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Get public information about a single namespace. This is the same information
// as returned by `listNamespaces`.
//
// See https://docs.do.not.exist.yet.service.not.in.production#namespace
func (myPulse *Pulse) Namespace(namespace string) (*Namespace1, error) {
	cd := tcclient.Client(*myPulse)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/namespace/"+url.QueryEscape(namespace), new(Namespace1), nil)
	return responseObject.(*Namespace1), err
}

// Stability: *** EXPERIMENTAL ***
//
// Claim a namespace, returning a username and password with access to that
// namespace good for a short time.  Clients should call this endpoint again
// at the re-claim time given in the response, as the password will be rotated
// soon after that time.  The namespace will expire, and any associated queues
// and exchanges will be deleted, at the given expiration time.
//
// The `expires` and `contact` properties can be updated at any time in a reclaim
// operation.
//
// Required scopes:
//   * pulse:namespace:<namespace>
//
// See https://docs.do.not.exist.yet.service.not.in.production#claimNamespace
func (myPulse *Pulse) ClaimNamespace(namespace string, payload *NamespaceCreationRequest) (*NamespaceCreationResponse, error) {
	cd := tcclient.Client(*myPulse)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/namespace/"+url.QueryEscape(namespace), new(NamespaceCreationResponse), nil)
	return responseObject.(*NamespaceCreationResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Immediately delete the given namespace.  This will delete all exchanges and queues which the
// namespace had configure access to, as if it had just expired.
//
// Required scopes:
//   * pulse:namespace:<namespace>
//
// See https://docs.do.not.exist.yet.service.not.in.production#deleteNamespace
func (myPulse *Pulse) DeleteNamespace(namespace string) error {
	cd := tcclient.Client(*myPulse)
	_, _, err := (&cd).APICall(nil, "DELETE", "/namespace/"+url.QueryEscape(namespace), nil, nil)
	return err
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
