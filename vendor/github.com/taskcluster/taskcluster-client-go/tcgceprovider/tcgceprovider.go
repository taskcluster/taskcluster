// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://taskcluster-staging.net/references/gce-provider/v1/api.json

// TODO
//
// See:
//
// How to use this package
//
// First create a GceProvider object:
//
//  gceProvider := tcgceprovider.New(nil)
//
// and then call one or more of gceProvider's methods, e.g.:
//
//  err := gceProvider.Ping(.....)
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
// https://taskcluster-staging.net/references/gce-provider/v1/api.json together with the input and output schemas it references, downloaded on
// Tue, 29 Jan 2019 at 08:22:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package tcgceprovider

import (
	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type GceProvider tcclient.Client

// New returns a GceProvider client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  gceProvider := tcgceprovider.New(
//      nil,                                      // client without authentication
//      "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//  )
//  err := gceProvider.Ping(.....)                // for example, call the Ping(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials, rootURL string) *GceProvider {
	return &GceProvider{
		Credentials:  credentials,
		BaseURL:      tcclient.BaseURL(rootURL, "gce-provider", "v1"),
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns a *GceProvider configured from environment variables.
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
func NewFromEnv() *GceProvider {
	c := tcclient.CredentialsFromEnvVars()
	return &GceProvider{
		Credentials:  c,
		BaseURL:      tcclient.BaseURL(tcclient.RootURLFromEnvVars(), "gce-provider", "v1"),
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (gceProvider *GceProvider) Ping() error {
	cd := tcclient.Client(*gceProvider)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// TODO
//
// See #getCredentials
func (gceProvider *GceProvider) GetCredentials() error {
	cd := tcclient.Client(*gceProvider)
	_, _, err := (&cd).APICall(nil, "POST", "/credentials", nil, nil)
	return err
}
