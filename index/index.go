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
// See: http://docs.taskcluster.net/services/index
//
// How to use this package
//
// First create an Index object:
//
//  myIndex := index.New("myClientId", "myAccessToken")
//
// and then call one or more of myIndex's methods, e.g.:
//
//  data, callSummary, err := myIndex.FindTask(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/index/v1/api.json together with the input and output schemas it references, downloaded on
// Wed, 6 Jan 2016 at 10:39:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package index

import (
	"encoding/json"
	"net/url"

	"github.com/taskcluster/taskcluster-client-go/tcclient"
	D "github.com/tj/go-debug"
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("index")
)

type Index tcclient.ConnectionData

// Returns a pointer to Index, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false.
//
// For example:
//  myIndex := index.New("123", "456")                       // set clientId and accessToken
//  myIndex.Authenticate = false                             // disable authentication (true by default)
//  myIndex.BaseURL = "http://localhost:1234/api/Index/v1"   // alternative API endpoint (production by default)
//  data, callSummary, err := myIndex.FindTask(.....)        // for example, call the FindTask(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(clientId string, accessToken string) *Index {
	myIndex := Index(tcclient.ConnectionData{
		ClientId:     clientId,
		AccessToken:  accessToken,
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
// See http://docs.taskcluster.net/services/index/#findTask
func (myIndex *Index) FindTask(namespace string) (*IndexedTaskResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myIndex)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(namespace), new(IndexedTaskResponse), nil)
	return responseObject.(*IndexedTaskResponse), callSummary, err
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
// See http://docs.taskcluster.net/services/index/#listNamespaces
func (myIndex *Index) ListNamespaces(namespace string, payload *ListNamespacesRequest) (*ListNamespacesResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myIndex)
	responseObject, callSummary, err := (&cd).APICall(payload, "POST", "/namespaces/"+url.QueryEscape(namespace), new(ListNamespacesResponse), nil)
	return responseObject.(*ListNamespacesResponse), callSummary, err
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
// See http://docs.taskcluster.net/services/index/#listTasks
func (myIndex *Index) ListTasks(namespace string, payload *ListTasksRequest) (*ListTasksResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myIndex)
	responseObject, callSummary, err := (&cd).APICall(payload, "POST", "/tasks/"+url.QueryEscape(namespace), new(ListTasksResponse), nil)
	return responseObject.(*ListTasksResponse), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Insert a task into the index. Please see the introduction above, for how
// to index successfully completed tasks automatically, using custom routes.
//
// Required scopes:
//   * index:insert-task:<namespace>
//
// See http://docs.taskcluster.net/services/index/#insertTask
func (myIndex *Index) InsertTask(namespace string, payload *InsertTaskRequest) (*IndexedTaskResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myIndex)
	responseObject, callSummary, err := (&cd).APICall(payload, "PUT", "/task/"+url.QueryEscape(namespace), new(IndexedTaskResponse), nil)
	return responseObject.(*IndexedTaskResponse), callSummary, err
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
// See http://docs.taskcluster.net/services/index/#findArtifactFromTask
func (myIndex *Index) FindArtifactFromTask(namespace string, name string) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myIndex)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/task/"+url.QueryEscape(namespace)+"/artifacts/"+url.QueryEscape(name), nil, nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/services/index/#ping
func (myIndex *Index) Ping() (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myIndex)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return callSummary, err
}

type (

	// Representation of an indexed task.
	//
	// See http://schemas.taskcluster.net/index/v1/indexed-task-response.json#
	IndexedTaskResponse struct {

		// Data that was reported with the task. This is an arbitrary JSON object.
		//
		// See http://schemas.taskcluster.net/index/v1/indexed-task-response.json#/properties/data
		Data json.RawMessage `json:"data"`

		// Date at which this entry expires from the task index.
		//
		// See http://schemas.taskcluster.net/index/v1/indexed-task-response.json#/properties/expires
		Expires tcclient.Time `json:"expires"`

		// Namespace of the indexed task, used to find the indexed task in the index.
		//
		// Max length: 255
		//
		// See http://schemas.taskcluster.net/index/v1/indexed-task-response.json#/properties/namespace
		Namespace string `json:"namespace"`

		// If multiple tasks are indexed with the same `namespace` the task with the
		// highest `rank` will be stored and returned in later requests. If two tasks
		// has the same `rank` the latest task will be stored.
		//
		// See http://schemas.taskcluster.net/index/v1/indexed-task-response.json#/properties/rank
		Rank float64 `json:"rank"`

		// Unique task identifier, this is UUID encoded as
		// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
		// stripped of `=` padding.
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		//
		// See http://schemas.taskcluster.net/index/v1/indexed-task-response.json#/properties/taskId
		TaskId string `json:"taskId"`
	}

	// Representation of an a task to be indexed.
	//
	// See http://schemas.taskcluster.net/index/v1/insert-task-request.json#
	InsertTaskRequest struct {

		// This is an arbitrary JSON object. Feel free to put whatever data you want
		// here, but do limit it, you'll get errors if you store more than 32KB.
		// So stay well, below that limit.
		//
		// See http://schemas.taskcluster.net/index/v1/insert-task-request.json#/properties/data
		Data json.RawMessage `json:"data"`

		// Date at which this entry expires from the task index.
		//
		// See http://schemas.taskcluster.net/index/v1/insert-task-request.json#/properties/expires
		Expires tcclient.Time `json:"expires"`

		// If multiple tasks are indexed with the same `namespace` the task with the
		// highest `rank` will be stored and returned in later requests. If two tasks
		// has the same `rank` the latest task will be stored.
		//
		// See http://schemas.taskcluster.net/index/v1/insert-task-request.json#/properties/rank
		Rank float64 `json:"rank"`

		// Unique task identifier, this is UUID encoded as
		// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
		// stripped of `=` padding.
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		//
		// See http://schemas.taskcluster.net/index/v1/insert-task-request.json#/properties/taskId
		TaskId string `json:"taskId"`
	}

	// Request to list namespaces within a given namespace.
	//
	// See http://schemas.taskcluster.net/index/v1/list-namespaces-request.json#
	ListNamespacesRequest struct {

		// A continuation token previously returned in a response to this list
		// request. This property is optional and should not be provided for first
		// requests.
		//
		// See http://schemas.taskcluster.net/index/v1/list-namespaces-request.json#/properties/continuationToken
		ContinuationToken string `json:"continuationToken"`

		// Maximum number of results per page. If there are more results than this
		// a continuation token will be return.
		//
		// Default:    1000
		// Mininum:    1
		// Maximum:    1000
		//
		// See http://schemas.taskcluster.net/index/v1/list-namespaces-request.json#/properties/limit
		Limit int `json:"limit"`
	}

	// Response from a request to list namespaces within a given namespace.
	//
	// See http://schemas.taskcluster.net/index/v1/list-namespaces-response.json#
	ListNamespacesResponse struct {

		// A continuation token is returned if there are more results than listed
		// here. You can optionally provide the token in the request payload to
		// load the additional results.
		//
		// See http://schemas.taskcluster.net/index/v1/list-namespaces-response.json#/properties/continuationToken
		ContinuationToken string `json:"continuationToken"`

		// List of namespaces.
		//
		// See http://schemas.taskcluster.net/index/v1/list-namespaces-response.json#/properties/namespaces
		Namespaces []struct {

			// Date at which this entry, and by implication all entries below it,
			// expires from the task index.
			//
			// See http://schemas.taskcluster.net/index/v1/list-namespaces-response.json#/properties/namespaces/items/properties/expires
			Expires tcclient.Time `json:"expires"`

			// Name of namespace within it's parent namespace.
			//
			// See http://schemas.taskcluster.net/index/v1/list-namespaces-response.json#/properties/namespaces/items/properties/name
			Name string `json:"name"`

			// Fully qualified name of the namespace, you can use this to list
			// namespaces or tasks under this namespace.
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/index/v1/list-namespaces-response.json#/properties/namespaces/items/properties/namespace
			Namespace string `json:"namespace"`
		} `json:"namespaces"`
	}

	// Request to list tasks within a given namespace.
	//
	// See http://schemas.taskcluster.net/index/v1/list-tasks-request.json#
	ListTasksRequest struct {

		// A continuation token previously returned in a response to this list
		// request. This property is optional and should not be provided for first
		// requests.
		//
		// See http://schemas.taskcluster.net/index/v1/list-tasks-request.json#/properties/continuationToken
		ContinuationToken string `json:"continuationToken"`

		// Maximum number of results per page. If there are more results than this
		// a continuation token will be return.
		//
		// Default:    1000
		// Mininum:    1
		// Maximum:    1000
		//
		// See http://schemas.taskcluster.net/index/v1/list-tasks-request.json#/properties/limit
		Limit int `json:"limit"`
	}

	// Representation of an indexed task.
	//
	// See http://schemas.taskcluster.net/index/v1/list-tasks-response.json#
	ListTasksResponse struct {

		// A continuation token is returned if there are more results than listed
		// here. You can optionally provide the token in the request payload to
		// load the additional results.
		//
		// See http://schemas.taskcluster.net/index/v1/list-tasks-response.json#/properties/continuationToken
		ContinuationToken string `json:"continuationToken"`

		// List of tasks.
		//
		// See http://schemas.taskcluster.net/index/v1/list-tasks-response.json#/properties/tasks
		Tasks []struct {

			// Data that was reported with the task. This is an arbitrary JSON
			// object.
			//
			// See http://schemas.taskcluster.net/index/v1/list-tasks-response.json#/properties/tasks/items/properties/data
			Data json.RawMessage `json:"data"`

			// Date at which this entry expires from the task index.
			//
			// See http://schemas.taskcluster.net/index/v1/list-tasks-response.json#/properties/tasks/items/properties/expires
			Expires tcclient.Time `json:"expires"`

			// Namespace of the indexed task, used to find the indexed task in the
			// index.
			//
			// Max length: 255
			//
			// See http://schemas.taskcluster.net/index/v1/list-tasks-response.json#/properties/tasks/items/properties/namespace
			Namespace string `json:"namespace"`

			// If multiple tasks are indexed with the same `namespace` the task
			// with the highest `rank` will be stored and returned in later
			// requests. If two tasks has the same `rank` the latest task will be
			// stored.
			//
			// See http://schemas.taskcluster.net/index/v1/list-tasks-response.json#/properties/tasks/items/properties/rank
			Rank float64 `json:"rank"`

			// Unique task identifier, this is UUID encoded as
			// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
			// stripped of `=` padding.
			//
			// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
			//
			// See http://schemas.taskcluster.net/index/v1/list-tasks-response.json#/properties/tasks/items/properties/taskId
			TaskId string `json:"taskId"`
		} `json:"tasks"`
	}
)
