// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run `go generate` in the
// clients/client-go/codegenerator/model subdirectory of the
// taskcluster git repository.

// This package was generated from the reference schema of
// the Index service, which is also published here:
//
//   * ${TASKCLUSTER_ROOT_URL}/references/index/v1/api.json
//
// where ${TASKCLUSTER_ROOT_URL} points to the root URL of
// your taskcluster deployment.

// The index service is responsible for indexing tasks. The service ensures that
// tasks can be located by user-defined names.
//
// As described in the service documentation, tasks are typically indexed via Pulse
// messages, so the most common use of API methods is to read from the index.
//
// Slashes (`/`) aren't allowed in index paths.
//
// See:
//
// # How to use this package
//
// First create an Index object:
//
//	index := tcindex.New(nil)
//
// and then call one or more of index's methods, e.g.:
//
//	err := index.Ping(.....)
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
// <rootUrl>/references/index/v1/api.json together with the input and output schemas it references,
package tcindex

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v93/clients/client-go"
)

type Index tcclient.Client

// New returns an Index client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//	index := tcindex.New(
//	    nil,                                      // client without authentication
//	    "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//	)
//	err := index.Ping(.....)                      // for example, call the Ping(.....) API endpoint (described further down)...
//	if err != nil {
//		// handle errors...
//	}
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
//	TASKCLUSTER_CLIENT_ID
//	TASKCLUSTER_ACCESS_TOKEN
//	TASKCLUSTER_CERTIFICATE
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

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #lbheartbeat
func (index *Index) Lbheartbeat() error {
	cd := tcclient.Client(*index)
	_, _, err := (&cd).APICall(nil, "GET", "/__lbheartbeat__", nil, nil)
	return err
}

// Respond with the JSON version object.
// https://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md
//
// See #version
func (index *Index) Version() error {
	cd := tcclient.Client(*index)
	_, _, err := (&cd).APICall(nil, "GET", "/__version__", nil, nil)
	return err
}

// Find a task by index path, returning the highest-rank task with that path. If no
// task exists for the given path, this API end-point will respond with a 404 status.
//
// Required scopes:
//
//	index:find-task:<indexPath>
//
// See #findTask
func (index *Index) FindTask(indexPath string) (*IndexedTaskResponse, error) {
	cd := tcclient.Client(*index)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.PathEscape(indexPath), new(IndexedTaskResponse), nil)
	return responseObject.(*IndexedTaskResponse), err
}

// Returns a signed URL for FindTask, valid for the specified duration.
//
// Required scopes:
//
//	index:find-task:<indexPath>
//
// See FindTask for more details.
func (index *Index) FindTask_SignedURL(indexPath string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*index)
	return (&cd).SignedURL("/task/"+url.PathEscape(indexPath), nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// # List the tasks given their labels
//
// This endpoint
// lists up to 1000 tasks. If more tasks are present, a
// `continuationToken` will be returned, which can be given in the next
// request, along with the same input data. If the input data is different
// the continuationToken will have no effect.
//
// Required scopes:
//
//	For indexPath in indexPaths each index:find-task:<indexPath>
//
// See #findTasksAtIndex
func (index *Index) FindTasksAtIndex(continuationToken, limit string, payload *ListTasksAtIndexRequest) (*ListTasksResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*index)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/tasks/indexes", new(ListTasksResponse), v)
	return responseObject.(*ListTasksResponse), err
}

// List the namespaces immediately under a given namespace.
//
// This endpoint
// lists up to 1000 namespaces. If more namespaces are present, a
// `continuationToken` will be returned, which can be given in the next
// request. For the initial request, the payload should be an empty JSON
// object.
//
// Required scopes:
//
//	index:list-namespaces:<namespace>
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
	responseObject, _, err := (&cd).APICall(nil, "GET", "/namespaces/"+url.PathEscape(namespace), new(ListNamespacesResponse), v)
	return responseObject.(*ListNamespacesResponse), err
}

// Returns a signed URL for ListNamespaces, valid for the specified duration.
//
// Required scopes:
//
//	index:list-namespaces:<namespace>
//
// See ListNamespaces for more details.
func (index *Index) ListNamespaces_SignedURL(namespace, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*index)
	return (&cd).SignedURL("/namespaces/"+url.PathEscape(namespace), v, duration)
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
// Required scopes:
//
//	index:list-tasks:<namespace>
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
	responseObject, _, err := (&cd).APICall(nil, "GET", "/tasks/"+url.PathEscape(namespace), new(ListTasksResponse), v)
	return responseObject.(*ListTasksResponse), err
}

// Returns a signed URL for ListTasks, valid for the specified duration.
//
// Required scopes:
//
//	index:list-tasks:<namespace>
//
// See ListTasks for more details.
func (index *Index) ListTasks_SignedURL(namespace, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*index)
	return (&cd).SignedURL("/tasks/"+url.PathEscape(namespace), v, duration)
}

// Insert a task into the index.  If the new rank is less than the existing rank
// at the given index path, the task is not indexed but the response is still 200 OK.
//
// Please see the introduction above for information
// about indexing successfully completed tasks automatically using custom routes.
//
// Required scopes:
//
//	index:insert-task:<namespace>
//
// See #insertTask
func (index *Index) InsertTask(namespace string, payload *InsertTaskRequest) (*IndexedTaskResponse, error) {
	cd := tcclient.Client(*index)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/task/"+url.PathEscape(namespace), new(IndexedTaskResponse), nil)
	return responseObject.(*IndexedTaskResponse), err
}

// Remove a task from the index.  This is intended for administrative use,
// where an index entry is no longer appropriate.  The parent namespace is
// not automatically deleted.  Index entries with lower rank that were
// previously inserted will not re-appear, as they were never stored.
//
// Required scopes:
//
//	index:delete-task:<namespace>
//
// See #deleteTask
func (index *Index) DeleteTask(namespace string) error {
	cd := tcclient.Client(*index)
	_, _, err := (&cd).APICall(nil, "DELETE", "/task/"+url.PathEscape(namespace), nil, nil)
	return err
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
//
//	queue:get-artifact:<name>
//
// See #findArtifactFromTask
func (index *Index) FindArtifactFromTask(indexPath, name string) error {
	cd := tcclient.Client(*index)
	_, _, err := (&cd).APICall(nil, "GET", "/task/"+url.PathEscape(indexPath)+"/artifacts/"+url.PathEscape(name), nil, nil)
	return err
}

// Returns a signed URL for FindArtifactFromTask, valid for the specified duration.
//
// Required scopes:
//
//	queue:get-artifact:<name>
//
// See FindArtifactFromTask for more details.
func (index *Index) FindArtifactFromTask_SignedURL(indexPath, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*index)
	return (&cd).SignedURL("/task/"+url.PathEscape(indexPath)+"/artifacts/"+url.PathEscape(name), nil, duration)
}

// Respond with a service heartbeat.
//
// This endpoint is used to check on backing services this service
// depends on.
//
// See #heartbeat
func (index *Index) Heartbeat() error {
	cd := tcclient.Client(*index)
	_, _, err := (&cd).APICall(nil, "GET", "/__heartbeat__", nil, nil)
	return err
}
