// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/index/v1/api.json

// The task index, typically available at `index.taskcluster.net`, is
// responsible for indexing tasks. In order to ensure that tasks can be
// located by recency and/or arbitrary strings. Common use-cases includes
//
//  * Locate tasks by git or mercurial `<revision>`, or
//  * Locate latest task from given `<branch>`, such as a release.
//
// **Index hierarchy**, tasks are indexed in a dot `.` separated hierarchy
// called a namespace. For example a task could be indexed in
// `<revision>.linux-64.release-build`. In this case the following
// namespaces is created.
//
//  1. `<revision>`, and,
//  2. `<revision>.linux-64`
//
// The inside the namespace `<revision>` you can find the namespace
// `<revision>.linux-64` inside which you can find the indexed task
// `<revision>.linux-64.release-build`. In this example you'll be able to
// find build for a given revision.
//
// **Task Rank**, when a task is indexed, it is assigned a `rank` (defaults
// to `0`). If another task is already indexed in the same namespace with
// the same lower or equal `rank`, the task will be overwritten. For example
// consider a task indexed as `mozilla-central.linux-64.release-build`, in
// this case on might choose to use a unix timestamp or mercurial revision
// number as `rank`. This way the latest completed linux 64 bit release
// build is always available at `mozilla-central.linux-64.release-build`.
//
// **Indexed Data**, when a task is located in the index you will get the
// `taskId` and an additional user-defined JSON blob that was indexed with
// task. You can use this to store additional information you would like to
// get additional from the index.
//
// **Entry Expiration**, all indexed entries must have an expiration date.
// Typically this defaults to one year, if not specified. If you are
// indexing tasks to make it easy to find artifacts, consider using the
// expiration date that the artifacts is assigned.
//
// **Valid Characters**, all keys in a namespace `<key1>.<key2>` must be
// in the form `/[a-zA-Z0-9_!~*'()%-]+/`. Observe that this is URL-safe and
// that if you strictly want to put another character you can URL encode it.
//
// **Indexing Routes**, tasks can be indexed using the API below, but the
// most common way to index tasks is adding a custom route on the following
// form `index.<namespace>`. In-order to add this route to a task you'll
// need the following scope `queue:route:index.<namespace>`. When a task has
// this route, it'll be indexed when the task is **completed successfully**.
// The task will be indexed with `rank`, `data` and `expires` as specified
// in `task.extra.index`, see example below:
//
// ```js
// {
//   payload:  { /* ... */ },
//   routes: [
//     // index.<namespace> prefixed routes, tasks CC'ed such a route will
//     // be indexed under the given <namespace>
//     "index.mozilla-central.linux-64.release-build",
//     "index.<revision>.linux-64.release-build"
//   ],
//   extra: {
//     // Optional details for indexing service
//     index: {
//       // Ordering, this taskId will overwrite any thing that has
//       // rank <= 4000 (defaults to zero)
//       rank:       4000,
//
//       // Specify when the entries expires (Defaults to 1 year)
//       expires:          new Date().toJSON(),
//
//       // A little informal data to store along with taskId
//       // (less 16 kb when encoded as JSON)
//       data: {
//         hgRevision:   "...",
//         commitMessae: "...",
//         whatever...
//       }
//     },
//     // Extra properties for other services...
//   }
//   // Other task properties...
// }
// ```
//
// **Remark**, when indexing tasks using custom routes, it's also possible
// to listen for messages about these tasks. Which is quite convenient, for
// example one could bind to `route.index.mozilla-central.*.release-build`,
// and pick up all messages about release builds. Hence, it is a
// good idea to document task index hierarchies, as these make up extension
// points in their own.
//
// See: https://docs.taskcluster.net/reference/core/index/api-docs
//
// How to use this package
//
// First create an Index object:
//
//  myIndex := index.New(&tcclient.Credentials{ClientId: "myClientId", AccessToken: "myAccessToken"})
//
// and then call one or more of myIndex's methods, e.g.:
//
//  data, err := myIndex.FindTask(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/index/v1/api.json together with the input and output schemas it references, downloaded on
// Mon, 6 Jun 2016 at 14:28:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package index

import (
	"net/url"
	"time"

	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

type Index tcclient.ConnectionData

// Returns a pointer to Index, configured to run against production.  If you
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
//  myIndex := index.New(creds)                              // set credentials
//  myIndex.Authenticate = false                             // disable authentication (creds above are now ignored)
//  myIndex.BaseURL = "http://localhost:1234/api/Index/v1"   // alternative API endpoint (production by default)
//  data, err := myIndex.FindTask(.....)                     // for example, call the FindTask(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Index {
	myIndex := Index(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://index.taskcluster.net/v1",
		Authenticate: true,
	})
	return &myIndex
}

// Stability: *** EXPERIMENTAL ***
//
// Find task by namespace, if no task existing for the given namespace, this
// API end-point respond `404`.
//
// See https://docs.taskcluster.net/reference/core/index/api-docs#findTask
func (myIndex *Index) FindTask(namespace string) (*IndexedTaskResponse, error) {
	cd := tcclient.ConnectionData(*myIndex)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(namespace), new(IndexedTaskResponse), nil)
	return responseObject.(*IndexedTaskResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// List the namespaces immediately under a given namespace. This end-point
// list up to 1000 namespaces. If more namespaces are present a
// `continuationToken` will be returned, which can be given in the next
// request. For the initial request, the payload should be an empty JSON
// object.
//
// **Remark**, this end-point is designed for humans browsing for tasks, not
// services, as that makes little sense.
//
// See https://docs.taskcluster.net/reference/core/index/api-docs#listNamespaces
func (myIndex *Index) ListNamespaces(namespace string, payload *ListNamespacesRequest) (*ListNamespacesResponse, error) {
	cd := tcclient.ConnectionData(*myIndex)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/namespaces/"+url.QueryEscape(namespace), new(ListNamespacesResponse), nil)
	return responseObject.(*ListNamespacesResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// List the tasks immediately under a given namespace. This end-point
// list up to 1000 tasks. If more tasks are present a
// `continuationToken` will be returned, which can be given in the next
// request. For the initial request, the payload should be an empty JSON
// object.
//
// **Remark**, this end-point is designed for humans browsing for tasks, not
// services, as that makes little sense.
//
// See https://docs.taskcluster.net/reference/core/index/api-docs#listTasks
func (myIndex *Index) ListTasks(namespace string, payload *ListTasksRequest) (*ListTasksResponse, error) {
	cd := tcclient.ConnectionData(*myIndex)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/tasks/"+url.QueryEscape(namespace), new(ListTasksResponse), nil)
	return responseObject.(*ListTasksResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Insert a task into the index. Please see the introduction above, for how
// to index successfully completed tasks automatically, using custom routes.
//
// Required scopes:
//   * index:insert-task:<namespace>
//
// See https://docs.taskcluster.net/reference/core/index/api-docs#insertTask
func (myIndex *Index) InsertTask(namespace string, payload *InsertTaskRequest) (*IndexedTaskResponse, error) {
	cd := tcclient.ConnectionData(*myIndex)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/task/"+url.QueryEscape(namespace), new(IndexedTaskResponse), nil)
	return responseObject.(*IndexedTaskResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Find task by namespace and redirect to artifact with given `name`,
// if no task existing for the given namespace, this API end-point respond
// `404`.
//
// Required scopes:
//   * queue:get-artifact:<name>
//
// See https://docs.taskcluster.net/reference/core/index/api-docs#findArtifactFromTask
func (myIndex *Index) FindArtifactFromTask(namespace, name string) error {
	cd := tcclient.ConnectionData(*myIndex)
	_, _, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(namespace)+"/artifacts/"+url.QueryEscape(name), nil, nil)
	return err
}

// Returns a signed URL for FindArtifactFromTask, valid for the specified duration.
//
// Required scopes:
//   * queue:get-artifact:<name>
//
// See FindArtifactFromTask for more details.
func (myIndex *Index) FindArtifactFromTask_SignedURL(namespace, name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.ConnectionData(*myIndex)
	return (&cd).SignedURL("/task/"+url.QueryEscape(namespace)+"/artifacts/"+url.QueryEscape(name), nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See https://docs.taskcluster.net/reference/core/index/api-docs#ping
func (myIndex *Index) Ping() error {
	cd := tcclient.ConnectionData(*myIndex)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
