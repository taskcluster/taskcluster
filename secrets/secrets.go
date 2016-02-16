// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/secrets/v1/api.json

// The secrets service, is a simple key/value store for secret data
// guarded by TaskCluster scopes.  It is typically available at
// `secrets.taskcluster.net`.
//
// See: http://docs.taskcluster.net/services/secrets
//
// How to use this package
//
// First create a Secrets object:
//
//  mySecrets := secrets.New(&tcclient.Credentials{ClientId: "myClientId", AccessToken: "myAccessToken"})
//
// and then call one or more of mySecrets's methods, e.g.:
//
//  callSummary, err := mySecrets.Set(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/secrets/v1/api.json together with the input and output schemas it references, downloaded on
// Tue, 16 Feb 2016 at 16:27:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package secrets

import (
	"net/url"
	"time"

	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

type Secrets tcclient.ConnectionData

// Returns a pointer to Secrets, configured to run against production.  If you
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
//  mySecrets := secrets.New(creds)                              // set credentials
//  mySecrets.Authenticate = false                               // disable authentication (creds above are now ignored)
//  mySecrets.BaseURL = "http://localhost:1234/api/Secrets/v1"   // alternative API endpoint (production by default)
//  callSummary, err := mySecrets.Set(.....)                     // for example, call the Set(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Secrets {
	mySecrets := Secrets(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://secrets.taskcluster.net/v1",
		Authenticate: true,
	})
	return &mySecrets
}

// Stability: *** EXPERIMENTAL ***
//
// Set a secret associated with some key.  If the secret already exists, it is updated instead.
//
// Required scopes:
//   * secrets:set:<name>
//
// See http://docs.taskcluster.net/services/secrets/#set
func (mySecrets *Secrets) Set(name string, payload *Secret) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*mySecrets)
	_, callSummary, err := (&cd).APICall(payload, "PUT", "/secret/"+url.QueryEscape(name), nil, nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Delete the secret attached to some key.
//
// Required scopes:
//   * secrets:set:<name>
//
// See http://docs.taskcluster.net/services/secrets/#remove
func (mySecrets *Secrets) Remove(name string) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*mySecrets)
	_, callSummary, err := (&cd).APICall(nil, "DELETE", "/secret/"+url.QueryEscape(name), nil, nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Read the secret attached to some key.
//
// Required scopes:
//   * secrets:get:<name>
//
// See http://docs.taskcluster.net/services/secrets/#get
func (mySecrets *Secrets) Get(name string) (*Secret, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*mySecrets)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/secret/"+url.QueryEscape(name), new(Secret), nil)
	return responseObject.(*Secret), callSummary, err
}

// Returns a signed URL for Get, valid for the specified duration.
//
// Required scopes:
//   * secrets:get:<name>
//
// See Get for more details.
func (mySecrets *Secrets) Get_SignedURL(name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.ConnectionData(*mySecrets)
	return (&cd).SignedURL("/secret/"+url.QueryEscape(name), nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// List the names of all visible secrets.
//
// See http://docs.taskcluster.net/services/secrets/#list
func (mySecrets *Secrets) List() (*SecretsList, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*mySecrets)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/secrets", new(SecretsList), nil)
	return responseObject.(*SecretsList), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/services/secrets/#ping
func (mySecrets *Secrets) Ping() (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*mySecrets)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return callSummary, err
}
