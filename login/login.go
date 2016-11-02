// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/login/v1/api.json

// The Login service serves as the interface between external authentication
// systems and TaskCluster credentials.  It acts as the server side of
// https://tools.taskcluster.net.  If you are working on federating logins
// with TaskCluster, this is probably *not* the service you are looking for.
// Instead, use the federated login support in the tools site.
//
// The API methods described here issue temporary credentials based on
// an assertion.  The assertion identifies the user, usually with an
// email-like string.  This string is then passed through a series of
// authorizers, each of which may supply scopes to be included in the
// credentials. Finally, the service generates temporary credentials based
// on those scopes.
//
// The generated credentials include scopes to create new, permanent clients
// with names based on the user's identifier.  These credentials are
// periodically scanned for scopes that the user does not posess, and disabled
// if such scopes are discovered.  Thus users can create long-lived credentials
// that are only usable until the user's access level is reduced.
//
// See: https://docs.taskcluster.net/reference/core/login/api-docs
//
// How to use this package
//
// First create a Login object:
//
//  myLogin := login.New(&tcclient.Credentials{ClientId: "myClientId", AccessToken: "myAccessToken"})
//
// and then call one or more of myLogin's methods, e.g.:
//
//  data, err := myLogin.CredentialsFromPersonaAssertion(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/login/v1/api.json together with the input and output schemas it references, downloaded on
// Wed, 2 Nov 2016 at 18:27:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package login

import tcclient "github.com/taskcluster/taskcluster-client-go"

type Login tcclient.ConnectionData

// Returns a pointer to Login, configured to run against production.  If you
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
//  myLogin := login.New(creds)                                   // set credentials
//  myLogin.Authenticate = false                                  // disable authentication (creds above are now ignored)
//  myLogin.BaseURL = "http://localhost:1234/api/Login/v1"        // alternative API endpoint (production by default)
//  data, err := myLogin.CredentialsFromPersonaAssertion(.....)   // for example, call the CredentialsFromPersonaAssertion(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Login {
	myLogin := Login(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://login.taskcluster.net/v1",
		Authenticate: true,
	})
	return &myLogin
}

// Stability: *** EXPERIMENTAL ***
//
// Given an [assertion](https://developer.mozilla.org/en-US/Persona/Quick_setup), return an appropriate set of temporary credentials.
//
// The supplied audience must be on a whitelist of TaskCluster-related
// sites configured in the login service.  This is not a general-purpose
// assertion-verification service!
//
// See https://docs.taskcluster.net/reference/core/login/api-docs#credentialsFromPersonaAssertion
func (myLogin *Login) CredentialsFromPersonaAssertion(payload *PersonaAssertionRequest) (*CredentialsResponse, error) {
	cd := tcclient.ConnectionData(*myLogin)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/persona", new(CredentialsResponse), nil)
	return responseObject.(*CredentialsResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See https://docs.taskcluster.net/reference/core/login/api-docs#ping
func (myLogin *Login) Ping() error {
	cd := tcclient.ConnectionData(*myLogin)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
