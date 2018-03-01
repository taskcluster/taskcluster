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
// systems and Taskcluster credentials.
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
// Thu, 1 Mar 2018 at 15:21:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package login

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

const (
	DefaultBaseURL = "https://login.taskcluster.net/v1"
)

type Login tcclient.Client

// New returns a Login client, configured to run against production. Pass in
// nil to load credentials from TASKCLUSTER_* environment variables. The
// returned client is mutable, so returned settings can be altered.
//
//  myLogin, err := login.New(nil)                           // credentials loaded from TASKCLUSTER_* env vars
//  if err != nil {
//      // handle malformed credentials...
//  }
//  myLogin.BaseURL = "http://localhost:1234/api/Login/v1"   // alternative API endpoint (production by default)
//  data, err := myLogin.OidcCredentials(.....)              // for example, call the OidcCredentials(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
//
// If authentication is not required, use NewNoAuth() instead.
func New(credentials *tcclient.Credentials) (*Login, error) {
	if credentials == nil {
		credentials = tcclient.CredentialsFromEnvVars()
	}
	err := credentials.Validate()
	myLogin := Login(tcclient.Client{
		Credentials:  credentials,
		BaseURL:      DefaultBaseURL,
		Authenticate: true,
	})
	return &myLogin, err
}

// NewNoAuth returns a Login client with authentication disabled. This is
// useful when calling taskcluster APIs that do not require authorization.
func NewNoAuth() *Login {
	myLogin := Login(tcclient.Client{
		BaseURL:      DefaultBaseURL,
		Authenticate: false,
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
