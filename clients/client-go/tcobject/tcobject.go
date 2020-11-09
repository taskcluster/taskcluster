// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// /references/object/v1/api.json
// The object service provides HTTP-accessible storage for large blobs of data.
//
// See:
//
// How to use this package
//
// First create an Object object:
//
//  object := tcobject.New(nil)
//
// and then call one or more of object's methods, e.g.:
//
//  err := object.Ping(.....)
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
// <rootUrl>/references/object/v1/api.json together with the input and output schemas it references,
package tcobject

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster/v38/clients/client-go"
)

type Object tcclient.Client

// New returns an Object client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  object := tcobject.New(
//      nil,                                      // client without authentication
//      "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//  )
//  err := object.Ping(.....)                     // for example, call the Ping(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials, rootURL string) *Object {
	return &Object{
		Credentials:  credentials,
		RootURL:      rootURL,
		ServiceName:  "object",
		APIVersion:   "v1",
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns an *Object configured from environment variables.
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
func NewFromEnv() *Object {
	c := tcclient.CredentialsFromEnvVars()
	rootURL := tcclient.RootURLFromEnvVars()
	return &Object{
		Credentials:  c,
		RootURL:      rootURL,
		ServiceName:  "object",
		APIVersion:   "v1",
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (object *Object) Ping() error {
	cd := tcclient.Client(*object)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Upload backend data.
//
// Required scopes:
//   object:upload:<name>/<projectId>
//
// See #uploadObject
func (object *Object) UploadObject(name, projectId string, payload *UploadObjectRequest) error {
	cd := tcclient.Client(*object)
	_, _, err := (&cd).APICall(payload, "POST", "/upload/"+url.QueryEscape(name)+"/"+url.QueryEscape(projectId), nil, nil)
	return err
}
