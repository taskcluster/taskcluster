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
	"time"

	tcclient "github.com/taskcluster/taskcluster/v39/clients/client-go"
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
//   object:upload:<projectId>:<name>
//
// See #uploadObject
func (object *Object) UploadObject(name string, payload *UploadObjectRequest) error {
	cd := tcclient.Client(*object)
	_, _, err := (&cd).APICall(payload, "PUT", "/upload/"+url.QueryEscape(name), nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Get information on how to download an object.  Call this endpoint with a list of acceptable
// download methods, and the server will select a method and return the corresponding payload.
// Returns a 406 error if none of the given download methods are available.
//
// See [Download Methods](https://docs.taskcluster.net/docs/reference/platform/object/download-methods) for more detail.
//
// Required scopes:
//   object:download:<name>
//
// See #fetchObjectMetadata
func (object *Object) FetchObjectMetadata(name string, payload *DownloadObjectRequest) (*DownloadObjectResponse, error) {
	cd := tcclient.Client(*object)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/download-object/"+url.QueryEscape(name), new(DownloadObjectResponse), nil)
	return responseObject.(*DownloadObjectResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Get the data in an object directly.  This method does not return a JSON body, but
// redirects to a location that will serve the object content directly.
//
// URLs for this endpoint, perhaps with attached authentication (`?bewit=..`),
// are typically used for downloads of objects by simple HTTP clients such as
// web browsers, curl, or wget.
//
// This method is limited by the common capabilities of HTTP, so it may not be
// the most efficient, resilient, or featureful way to retrieve an artifact.
// Situations where such functionality is required should ues the
// `fetchObjectMetadata` API endpoint.
//
// See [Simple Downloads](https://docs.taskcluster.net/docs/reference/platform/object/simple-downloads) for more detail.
//
// Required scopes:
//   object:download:<name>
//
// See #download
func (object *Object) Download(name string) error {
	cd := tcclient.Client(*object)
	_, _, err := (&cd).APICall(nil, "GET", "/download/"+url.QueryEscape(name), nil, nil)
	return err
}

// Returns a signed URL for Download, valid for the specified duration.
//
// Required scopes:
//   object:download:<name>
//
// See Download for more details.
func (object *Object) Download_SignedURL(name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*object)
	return (&cd).SignedURL("/download/"+url.QueryEscape(name), nil, duration)
}
