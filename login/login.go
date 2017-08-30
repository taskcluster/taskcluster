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
// systems and TaskCluster credentials.
//
// See: https://docs.taskcluster.net/reference/core/login/api-docs
//
// How to use this package
//
// First create a Login object:
//
//  myLogin := login.New(&tcclient.Credentials{ClientID: "myClientID", AccessToken: "myAccessToken"})
//
// and then call one or more of myLogin's methods, e.g.:
//
//  data, err := myLogin.OidcCredentials(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/login/v1/api.json together with the input and output schemas it references, downloaded on
// Wed, 30 Aug 2017 at 17:24:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package login

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type Login tcclient.Client

// Returns a pointer to Login, configured to run against production.  If you
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
//  myLogin := login.New(creds)                              // set credentials
//  myLogin.Authenticate = false                             // disable authentication (creds above are now ignored)
//  myLogin.BaseURL = "http://localhost:1234/api/Login/v1"   // alternative API endpoint (production by default)
//  data, err := myLogin.OidcCredentials(.....)              // for example, call the OidcCredentials(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Login {
	myLogin := Login(tcclient.Client{
		Credentials:  credentials,
		BaseURL:      "https://login.taskcluster.net/v1",
		Authenticate: true,
	})
	return &myLogin
}

// Stability: *** EXPERIMENTAL ***
//
// Given an OIDC `access_token` from a trusted OpenID provider, return a
// set of Taskcluster credentials for use on behalf of the identified
// user.
//
// This method is typically not called with a Taskcluster client library
// and does not accept Hawk credentials. The `access_token` should be
// given in an `Authorization` header:
// ```
// Authorization: Bearer abc.xyz
// ```
//
// The `access_token` is first verified against the named
// :provider, then passed to the provider's API to retrieve a user
// profile. That profile is then used to generate Taskcluster credentials
// appropriate to the user. Note that the resulting credentials may or may
// not include a `certificate` property. Callers should be prepared for either
// alternative.
//
// The given credentials will expire in a relatively short time. Callers should
// monitor this expiration and refresh the credentials if necessary, by calling
// this endpoint again, if they have expired.
//
// See https://docs.taskcluster.net/reference/core/login/api-docs#oidcCredentials
func (myLogin *Login) OidcCredentials(provider string) (*CredentialsResponse, error) {
	cd := tcclient.Client(*myLogin)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/oidc-credentials/"+url.QueryEscape(provider), new(CredentialsResponse), nil)
	return responseObject.(*CredentialsResponse), err
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See https://docs.taskcluster.net/reference/core/login/api-docs#ping
func (myLogin *Login) Ping() error {
	cd := tcclient.Client(*myLogin)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
