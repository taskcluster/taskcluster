// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// /references/index/v1/api.json
// The index service is responsible for indexing tasks. The service ensures that
// tasks can be located by user-defined names.
//
// As described in the service documentation, tasks are typically indexed via Pulse
// messages, so the most common use of API methods is to read from the index.
//
// See:
//
// How to use this package
//
// First create an Index object:
//
//  index := tcindex.New(nil)
//
// and then call one or more of index's methods, e.g.:
//
//  err := index.Ping(.....)
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
// <rootUrl>/references/index/v1/api.json together with the input and output schemas it references,
package tcindex

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v30/clients/client-go"
)

type Index tcclient.Client

// New returns an Index client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  index := tcindex.New(
//      nil,                                      // client without authentication
//      "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//  )
//  err := index.Ping(.....)                      // for example, call the Ping(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials, rootURL string) *Index {
	return &Index{
		Credentials:  credentials,
		RootURL:      rootURL,
		ServiceName:  "index",
		APIVersion:   "v1",
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns an *Index configured from environment variables.
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
func NewFromEnv() *Index {
	c := tcclient.CredentialsFromEnvVars()
	rootURL := tcclient.RootURLFromEnvVars()
	return &Index{
		Credentials:  c,
		RootURL:      rootURL,
		ServiceName:  "index",
		APIVersion:   "v1",
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (index *Index) Ping() error {
	cd := tcclient.Client(*index)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Find a task by index path, returning the highest-rank task with that path. If no
// task exists for the given path, this API end-point will respond with a 404 status.
//
// See #findTask
func (index *Index) FindTask(indexPath string) (*IndexedTaskResponse, error) {
	cd := tcclient.Client(*index)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(indexPath), new(IndexedTaskResponse), nil)
	return responseObject.(*IndexedTaskResponse), err
}

// List the namespaces immediately under a given namespace.
//
// This endpoint
// lists up to 1000 namespaces. If more namespaces are present, a
// `continuationToken` will be returned, which can be given in the next
// request. For the initial request, the payload should be an empty JSON
// object.
//
// See #listNamespaces
func (index *Index) ListNamespaces(namespace, continuationToken, limit string) (*ListNamespacesResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*index)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/namespaces/"+url.QueryEscape(namespace), new(ListNamespacesResponse), v)
	return responseObject.(*ListNamespacesResponse), err
}

// List the tasks immediately under a given namespace.
//
// This endpoint
// lists up to 1000 tasks. If more tasks are present, a
// `continuationToken` will be returned, which can be given in the next
// request. For the initial request, the payload should be an empty JSON
// object.
//
// **Remark**, this end-point is designed for humans browsing for tasks, not
// services, as that makes little sense.
//
// See #listTasks
func (index *Index) ListTasks(namespace, continuationToken, limit string) (*ListTasksResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*index)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/tasks/"+url.QueryEscape(namespace), new(ListTasksResponse), v)
	return responseObject.(*ListTasksResponse), err
}

// Insert a task into the index.  If the new rank is less than the existing rank
// at the given index path, the task is not indexed but the response is still 200 OK.
//
// Please see the introduction above for information
// about indexing successfully completed tasks automatically using custom routes.
//
// Required scopes:
//   index:insert-task:<namespace>
//
// See #insertTask
func (index *Index) InsertTask(namespace string, payload *InsertTaskRequest) (*IndexedTaskResponse, error) {
	cd := tcclient.Client(*index)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/task/"+url.QueryEscape(namespace), new(IndexedTaskResponse), nil)
	return responseObject.(*IndexedTaskResponse), err
}

// Find a task by index path and redirect to the artifact on the most recent
// run with the given `name`.
//
// Note that multiple calls to this endpoint may return artifacts from differen tasks
// if a new task is inserted into the index between calls. Avoid using this method as
// a stable link to multiple, connected files if the index path does not contain a
// unique identifier.  For example, the following two links may return unrelated files:
// * https://tc.example.com/api/index/v1/task/some-app.win64.latest.installer/artifacts/public/installer.exe`
// * https://tc.example.com/api/index/v1/task/some-app.win64.latest.installer/artifacts/public/debug-symbols.zip`
//
// This problem be remedied by including the revision in the index path or by bundling both
// installer and debug symbols into a single artifact.
//
// If no task exists for the given index path, this API end-point responds with 404.
//
// Required scopes:
//   If private:
//     queue:get-artifact:<name>
//
// See #findArtifactFromTask
func (index *Index) FindArtifactFromTask(indexPath, name string) error {
	cd := tcclient.Client(*index)
	_, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(indexPath)+"/artifacts/"+url.QueryEscape(name), nil, nil)
	return err
}

// Returns a signed URL for FindArtifactFromTask, valid for the specified duration.
//
// Required scopes:
//   If private:
//     queue:get-artifact:<name>
//
// See FindArtifactFromTask for more details.
func (index *Index) FindArtifactFromTask_SignedURL(indexPath, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*index)
	return (&cd).SignedURL("/task/"+url.QueryEscape(indexPath)+"/artifacts/"+url.QueryEscape(name), nil, duration)
}
