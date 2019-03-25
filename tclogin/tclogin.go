// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://taskcluster-staging.net/references/login/v1/api.json

// The Login service serves as the interface between external authentication
// systems and Taskcluster credentials.
//
// See:
//
// How to use this package
//
// First create a Login object:
//
//  login := tclogin.New(nil)
//
// and then call one or more of login's methods, e.g.:
//
//  err := login.Ping(.....)
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
// https://taskcluster-staging.net/references/login/v1/api.json together with the input and output schemas it references, downloaded on
// Mon, 25 Mar 2019 at 18:29:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package tclogin

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type Login tcclient.Client

// New returns a Login client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  login := tclogin.New(
//      nil,                                      // client without authentication
//      "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//  )
//  err := login.Ping(.....)                      // for example, call the Ping(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials, rootURL string) *Login {
	return &Login{
		Credentials:  credentials,
		BaseURL:      tcclient.BaseURL(rootURL, "login", "v1"),
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns a *Login configured from environment variables.
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
func NewFromEnv() *Login {
	c := tcclient.CredentialsFromEnvVars()
	return &Login{
		Credentials:  c,
		BaseURL:      tcclient.BaseURL(tcclient.RootURLFromEnvVars(), "login", "v1"),
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (login *Login) Ping() error {
	cd := tcclient.Client(*login)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
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
// :provider, then passed to the provider's APIBuilder to retrieve a user
// profile. That profile is then used to generate Taskcluster credentials
// appropriate to the user. Note that the resulting credentials may or may
// not include a `certificate` property. Callers should be prepared for either
// alternative.
//
// The given credentials will expire in a relatively short time. Callers should
// monitor this expiration and refresh the credentials if necessary, by calling
// this endpoint again, if they have expired.
//
// See #oidcCredentials
func (login *Login) OidcCredentials(provider string) (*CredentialsResponse, error) {
	cd := tcclient.Client(*login)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/oidc-credentials/"+url.QueryEscape(provider), new(CredentialsResponse), nil)
	return responseObject.(*CredentialsResponse), err
}
