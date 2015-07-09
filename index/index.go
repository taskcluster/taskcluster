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
// First create an authentication object:
//
//  Index := index.New("myClientId", "myAccessToken")
//
// and then call one or more of auth's methods, e.g.:
//
//  data, callSummary := Index.FindTask(.....)
// handling any errors...
//  if callSummary.Error != nil {
//  	// handle error...
//  }
package index

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/taskcluster/httpbackoff"
	hawk "github.com/tent/hawk-go"
	D "github.com/tj/go-debug"
	"io"
	"io/ioutil"
	"net/http"
	"reflect"
	"time"
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("index")
)

// apiCall is the generic REST API calling method which performs all REST API
// calls for this library.  Each auto-generated REST API method simply is a
// wrapper around this method, calling it with specific specific arguments.
func (auth *Auth) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *CallSummary) {
	callSummary := new(CallSummary)
	callSummary.HttpRequestObject = payload
	var jsonPayload []byte
	jsonPayload, callSummary.Error = json.Marshal(payload)
	if callSummary.Error != nil {
		return result, callSummary
	}
	callSummary.HttpRequestBody = string(jsonPayload)

	httpClient := &http.Client{}

	// function to perform http request - we call this using backoff library to
	// have exponential backoff in case of intermittent failures (e.g. network
	// blips or HTTP 5xx errors)
	httpCall := func() (*http.Response, error, error) {
		var ioReader io.Reader = nil
		if reflect.ValueOf(payload).IsValid() && !reflect.ValueOf(payload).IsNil() {
			ioReader = bytes.NewReader(jsonPayload)
		}
		httpRequest, err := http.NewRequest(method, auth.BaseURL+route, ioReader)
		if err != nil {
			return nil, nil, fmt.Errorf("apiCall url cannot be parsed: '%v', is your BaseURL (%v) set correctly?\n%v\n", auth.BaseURL+route, auth.BaseURL, err)
		}
		httpRequest.Header.Set("Content-Type", "application/json")
		callSummary.HttpRequest = httpRequest
		// Refresh Authorization header with each call...
		// Only authenticate if client library user wishes to.
		if auth.Authenticate {
			credentials := &hawk.Credentials{
				ID:   auth.ClientId,
				Key:  auth.AccessToken,
				Hash: sha256.New,
			}
			reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0)
			if auth.Certificate != "" {
				reqAuth.Ext = base64.StdEncoding.EncodeToString([]byte("{\"certificate\":" + auth.Certificate + "}"))
			}
			httpRequest.Header.Set("Authorization", reqAuth.RequestHeader())
		}
		debug("Making http request: %v", httpRequest)
		resp, err := httpClient.Do(httpRequest)
		return resp, err, nil
	}

	// Make HTTP API calls using an exponential backoff algorithm...
	callSummary.HttpResponse, callSummary.Attempts, callSummary.Error = httpbackoff.Retry(httpCall)

	if callSummary.Error != nil {
		return result, callSummary
	}

	// now read response into memory, so that we can return the body
	var body []byte
	body, callSummary.Error = ioutil.ReadAll(callSummary.HttpResponse.Body)

	if callSummary.Error != nil {
		return result, callSummary
	}

	callSummary.HttpResponseBody = string(body)

	// if result is passed in as nil, it means the API defines no response body
	// json
	if reflect.ValueOf(result).IsValid() && !reflect.ValueOf(result).IsNil() {
		callSummary.Error = json.Unmarshal([]byte(callSummary.HttpResponseBody), &result)
		if callSummary.Error != nil {
			// technically not needed since returned outside if, but more comprehensible
			return result, callSummary
		}
	}

	// Return result and callSummary
	return result, callSummary
}

// The entry point into all the functionality in this package is to create an
// Auth object.  It contains your authentication credentials, which are
// required for all HTTP operations.
type Auth struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
	// The URL of the API endpoint to hit.
	// Use "https://index.taskcluster.net/v1" for production.
	// Please note calling auth.New(clientId string, accessToken string) is an
	// alternative way to create an Auth object with BaseURL set to production.
	BaseURL string
	// Whether authentication is enabled (e.g. set to 'false' when using taskcluster-proxy)
	// Please note calling auth.New(clientId string, accessToken string) is an
	// alternative way to create an Auth object with Authenticate set to true.
	Authenticate bool
	// Certificate for temporary credentials
	Certificate string
}

// CallSummary provides information about the underlying http request and
// response issued for a given API call, together with details of any Error
// which occured. After making an API call, be sure to check the returned
// CallSummary.Error - if it is nil, no error occurred.
type CallSummary struct {
	HttpRequest *http.Request
	// Keep a copy of request body in addition to the *http.Request, since
	// accessing the Body via the *http.Request object, you get a io.ReadCloser
	// - and after the request has been made, the body will have been read, and
	// the data lost... This way, it is still available after the api call
	// returns.
	HttpRequestBody string
	// The Go Type which is marshaled into json and used as the http request
	// body.
	HttpRequestObject interface{}
	HttpResponse      *http.Response
	// Keep a copy of response body in addition to the *http.Response, since
	// accessing the Body via the *http.Response object, you get a
	// io.ReadCloser - and after the response has been read once (to unmarshal
	// json into native go types) the data is lost... This way, it is still
	// available after the api call returns.
	HttpResponseBody string
	Error            error
	// Keep a record of how many http requests were attempted
	Attempts int
}

// Returns a pointer to Auth, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false.
//
// For example:
//  Index := index.New("123", "456")                       // set clientId and accessToken
//  Index.Authenticate = false                             // disable authentication (true by default)
//  Index.BaseURL = "http://localhost:1234/api/Index/v1"   // alternative API endpoint (production by default)
//  data, callSummary := Index.FindTask(.....)             // for example, call the FindTask(.....) API endpoint (described further down)...
//  if callSummary.Error != nil {
//  	// handle errors...
//  }
func New(clientId string, accessToken string) *Auth {
	return &Auth{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://index.taskcluster.net/v1",
		Authenticate: true,
	}
}

// Find task by namespace, if no task existing for the given namespace, this
// API end-point respond `404`.
//
// See http://docs.taskcluster.net/services/index/#findTask
func (a *Auth) FindTask(namespace string) (*IndexedTaskResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/task/"+namespace+"", new(IndexedTaskResponse))
	return responseObject.(*IndexedTaskResponse), callSummary
}

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
func (a *Auth) ListNamespaces(namespace string, payload *ListNamespacesRequest) (*ListNamespacesResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "POST", "/namespaces/"+namespace+"", new(ListNamespacesResponse))
	return responseObject.(*ListNamespacesResponse), callSummary
}

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
func (a *Auth) ListTasks(namespace string, payload *ListTasksRequest) (*ListTasksResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "POST", "/tasks/"+namespace+"", new(ListTasksResponse))
	return responseObject.(*ListTasksResponse), callSummary
}

// Insert a task into the index. Please see the introduction above, for how
// to index successfully completed tasks automatically, using custom routes.
//
// See http://docs.taskcluster.net/services/index/#insertTask
func (a *Auth) InsertTask(namespace string, payload *InsertTaskRequest) (*IndexedTaskResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "PUT", "/task/"+namespace+"", new(IndexedTaskResponse))
	return responseObject.(*IndexedTaskResponse), callSummary
}

// Find task by namespace and redirect to artifact with given `name`,
// if no task existing for the given namespace, this API end-point respond
// `404`.
//
// See http://docs.taskcluster.net/services/index/#findArtifactFromTask
func (a *Auth) FindArtifactFromTask(namespace string, name string) *CallSummary {
	_, callSummary := a.apiCall(nil, "GET", "/task/"+namespace+"/artifacts/"+name+"", nil)
	return callSummary
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/services/index/#ping
func (a *Auth) Ping() *CallSummary {
	_, callSummary := a.apiCall(nil, "GET", "/ping", nil)
	return callSummary
}

type (
	// Representation of an indexed task.
	//
	// See http://schemas.taskcluster.net/index/v1/indexed-task-response.json#
	IndexedTaskResponse struct {
		// Data that was reported with the task. This is an arbitrary JSON object.
		Data map[string]json.RawMessage `json:"data"`
		// Date at which this entry expires from the task index.
		Expires time.Time `json:"expires"`
		// Namespace of the indexed task, used to find the indexed task in the index.
		Namespace string `json:"namespace"`
		// If multiple tasks are indexed with the same `namespace` the task with the
		// highest `rank` will be stored and returned in later requests. If two tasks
		// has the same `rank` the latest task will be stored.
		Rank int `json:"rank"`
		// Unique task identifier, this is UUID encoded as
		// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
		// stripped of `=` padding.
		TaskId string `json:"taskId"`
	}

	// Representation of an a task to be indexed.
	//
	// See http://schemas.taskcluster.net/index/v1/insert-task-request.json#
	InsertTaskRequest struct {
		// This is an arbitrary JSON object. Feel free to put whatever data you want
		// here, but do limit it, you'll get errors if you store more than 32KB.
		// So stay well, below that limit.
		Data map[string]json.RawMessage `json:"data"`
		// Date at which this entry expires from the task index.
		Expires time.Time `json:"expires"`
		// If multiple tasks are indexed with the same `namespace` the task with the
		// highest `rank` will be stored and returned in later requests. If two tasks
		// has the same `rank` the latest task will be stored.
		Rank int `json:"rank"`
		// Unique task identifier, this is UUID encoded as
		// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
		// stripped of `=` padding.
		TaskId string `json:"taskId"`
	}

	// Request to list namespaces within a given namespace.
	//
	// See http://schemas.taskcluster.net/index/v1/list-namespaces-request.json#
	ListNamespacesRequest struct {
		// A continuation token previously returned in a response to this list
		// request. This property is optional and should not be provided for first
		// requests.
		ContinuationToken string `json:"continuationToken"`
		// Maximum number of results per page. If there are more results than this
		// a continuation token will be return.
		Limit int `json:"limit"`
	}

	// Response from a request to list namespaces within a given namespace.
	//
	// See http://schemas.taskcluster.net/index/v1/list-namespaces-response.json#
	ListNamespacesResponse struct {
		// A continuation token is returned if there are more results than listed
		// here. You can optionally provide the token in the request payload to
		// load the additional results.
		ContinuationToken string `json:"continuationToken"`
		// List of namespaces.
		Namespaces []struct {
			// Date at which this entry, and by implication all entries below it,
			// expires from the task index.
			Expires time.Time `json:"expires"`
			// Name of namespace within it's parent namespace.
			Name json.RawMessage `json:"name"`
			// Fully qualified name of the namespace, you can use this to list
			// namespaces or tasks under this namespace.
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
		ContinuationToken string `json:"continuationToken"`
		// Maximum number of results per page. If there are more results than this
		// a continuation token will be return.
		Limit int `json:"limit"`
	}

	// Representation of an indexed task.
	//
	// See http://schemas.taskcluster.net/index/v1/list-tasks-response.json#
	ListTasksResponse struct {
		// A continuation token is returned if there are more results than listed
		// here. You can optionally provide the token in the request payload to
		// load the additional results.
		ContinuationToken string `json:"continuationToken"`
		// List of tasks.
		Tasks []struct {
			// Data that was reported with the task. This is an arbitrary JSON
			// object.
			Data map[string]json.RawMessage `json:"data"`
			// Date at which this entry expires from the task index.
			Expires time.Time `json:"expires"`
			// Namespace of the indexed task, used to find the indexed task in the
			// index.
			Namespace string `json:"namespace"`
			// If multiple tasks are indexed with the same `namespace` the task
			// with the highest `rank` will be stored and returned in later
			// requests. If two tasks has the same `rank` the latest task will be
			// stored.
			Rank int `json:"rank"`
			// Unique task identifier, this is UUID encoded as
			// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
			// stripped of `=` padding.
			TaskId string `json:"taskId"`
		} `json:"tasks"`
	}
)
