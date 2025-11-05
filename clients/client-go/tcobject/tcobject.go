// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run `go generate` in the
// clients/client-go/codegenerator/model subdirectory of the
// taskcluster git repository.

// This package was generated from the reference schema of
// the Object service, which is also published here:
//
//   * ${TASKCLUSTER_ROOT_URL}/references/object/v1/api.json
//
// where ${TASKCLUSTER_ROOT_URL} points to the root URL of
// your taskcluster deployment.

// The object service provides HTTP-accessible storage for large blobs of data.
//
// Objects can be uploaded and downloaded, with the object data flowing directly
// from the storage "backend" to the caller, and not directly via this service.
// Once uploaded, objects are immutable until their expiration time.
//
// See:
//
// # How to use this package
//
// First create an Object object:
//
//	object := tcobject.New(nil)
//
// and then call one or more of object's methods, e.g.:
//
//	err := object.Ping(.....)
//
// handling any errors...
//
//	if err != nil {
//		// handle error...
//	}
//
// # Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// <rootUrl>/references/object/v1/api.json together with the input and output schemas it references,
package tcobject

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v92/clients/client-go"
)

type Object tcclient.Client

// New returns an Object client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//	object := tcobject.New(
//	    nil,                                      // client without authentication
//	    "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//	)
//	err := object.Ping(.....)                     // for example, call the Ping(.....) API endpoint (described further down)...
//	if err != nil {
//		// handle errors...
//	}
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
//	TASKCLUSTER_CLIENT_ID
//	TASKCLUSTER_ACCESS_TOKEN
//	TASKCLUSTER_CERTIFICATE
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

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #lbheartbeat
func (object *Object) Lbheartbeat() error {
	cd := tcclient.Client(*object)
	_, _, err := (&cd).APICall(nil, "GET", "/__lbheartbeat__", nil, nil)
	return err
}

// Respond with the JSON version object.
// https://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md
//
// See #version
func (object *Object) Version() error {
	cd := tcclient.Client(*object)
	_, _, err := (&cd).APICall(nil, "GET", "/__version__", nil, nil)
	return err
}

// Create a new object by initiating upload of its data.
//
// This endpoint implements negotiation of upload methods.  It can be called
// multiple times if necessary, either to propose new upload methods or to
// renew credentials for an already-agreed upload.
//
// The `name` parameter can contain any printable ASCII character (0x20 - 0x7e).
// The `uploadId` must be supplied by the caller, and any attempts to upload
// an object with the same name but a different `uploadId` will fail.
// Thus the first call to this method establishes the `uploadId` for the
// object, and as long as that value is kept secret, no other caller can
// upload an object of that name, regardless of scopes.  Object expiration
// cannot be changed after the initial call, either.  It is possible to call
// this method with no proposed upload methods, which has the effect of "locking
// in" the `expiration`, `projectId`, and `uploadId` properties and any
// supplied hashes.
//
// Unfinished uploads expire after 1 day.
//
// Required scopes:
//
//	object:upload:<projectId>:<name>
//
// See #createUpload
func (object *Object) CreateUpload(name string, payload *CreateUploadRequest) (*CreateUploadResponse, error) {
	cd := tcclient.Client(*object)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/upload/"+url.QueryEscape(name), new(CreateUploadResponse), nil)
	return responseObject.(*CreateUploadResponse), err
}

// This endpoint marks an upload as complete.  This indicates that all data has been
// transmitted to the backend.  After this call, no further calls to `uploadObject` are
// allowed, and downloads of the object may begin.  This method is idempotent, but will
// fail if given an incorrect uploadId for an unfinished upload.
//
// It is possible to finish an upload with no hashes specified via either
// `startUpload` or `finishUpload`.  However, many clients will refuse to
// download an object with no hashes.  The utility methods included with the
// client libraries always include hashes as of version 44.0.0.
//
// Note that, once `finishUpload` is complete, the object is considered immutable.
//
// Required scopes:
//
//	object:upload:<projectId>:<name>
//
// See #finishUpload
func (object *Object) FinishUpload(name string, payload *FinishUploadRequest) error {
	cd := tcclient.Client(*object)
	_, _, err := (&cd).APICall(payload, "POST", "/finish-upload/"+url.QueryEscape(name), nil, nil)
	return err
}

// Start the process of downloading an object's data.  Call this endpoint with a list of acceptable
// download methods, and the server will select a method and return the corresponding payload.
//
// Returns a 406 error if none of the given download methods are available.
//
// See [Download Methods](https://docs.taskcluster.net/docs/reference/platform/object/download-methods) for more detail.
//
// Required scopes:
//
//	object:download:<name>
//
// See #startDownload
func (object *Object) StartDownload(name string, payload *DownloadObjectRequest) (*DownloadObjectResponse, error) {
	cd := tcclient.Client(*object)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/start-download/"+url.QueryEscape(name), new(DownloadObjectResponse), nil)
	return responseObject.(*DownloadObjectResponse), err
}

// Get the metadata for the named object.  This metadata is not sufficient to
// get the object's content; for that use `startDownload`.
//
// Required scopes:
//
//	object:download:<name>
//
// See #object
func (object *Object) Object(name string) (*ObjectMetadata, error) {
	cd := tcclient.Client(*object)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/metadata/"+url.QueryEscape(name), new(ObjectMetadata), nil)
	return responseObject.(*ObjectMetadata), err
}

// Returns a signed URL for Object, valid for the specified duration.
//
// Required scopes:
//
//	object:download:<name>
//
// See Object for more details.
func (object *Object) Object_SignedURL(name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*object)
	return (&cd).SignedURL("/metadata/"+url.QueryEscape(name), nil, duration)
}

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
// `startDownload` API endpoint.
//
// See [Simple Downloads](https://docs.taskcluster.net/docs/reference/platform/object/simple-downloads) for more detail.
//
// Required scopes:
//
//	object:download:<name>
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
//
//	object:download:<name>
//
// See Download for more details.
func (object *Object) Download_SignedURL(name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*object)
	return (&cd).SignedURL("/download/"+url.QueryEscape(name), nil, duration)
}

// Respond with a service heartbeat.
//
// This endpoint is used to check on backing services this service
// depends on.
//
// See #heartbeat
func (object *Object) Heartbeat() error {
	cd := tcclient.Client(*object)
	_, _, err := (&cd).APICall(nil, "GET", "/__heartbeat__", nil, nil)
	return err
}
