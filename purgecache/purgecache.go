// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/purge-cache/v1/api.json

// The purge-cache service, typically available at
// `purge-cache.taskcluster.net`, is responsible for publishing a pulse
// message for workers, so they can purge cache upon request.
//
// This document describes the API end-point for publishing the pulse
// message. This is mainly intended to be used by tools.
//
// See: http://docs.taskcluster.net/services/purge-cache
//
// How to use this package
//
// First create a PurgeCache object:
//
//  purgeCache := purgecache.New("myClientId", "myAccessToken")
//
// and then call one or more of purgeCache's methods, e.g.:
//
//  callSummary, err := purgeCache.PurgeCache(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/purge-cache/v1/api.json together with the input and output schemas it references, downloaded on
// Fri, 4 Dec 2015 at 12:57:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package purgecache

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"reflect"
	"time"

	"github.com/taskcluster/httpbackoff"
	hawk "github.com/tent/hawk-go"
	D "github.com/tj/go-debug"
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("purgecache")
)

// apiCall is the generic REST API calling method which performs all REST API
// calls for this library.  Each auto-generated REST API method simply is a
// wrapper around this method, calling it with specific specific arguments.
func (purgeCache *PurgeCache) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *CallSummary, error) {
	callSummary := new(CallSummary)
	callSummary.HttpRequestObject = payload
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return result, callSummary, err
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
		httpRequest, err := http.NewRequest(method, purgeCache.BaseURL+route, ioReader)
		if err != nil {
			return nil, nil, fmt.Errorf("apiCall url cannot be parsed: '%v', is your BaseURL (%v) set correctly?\n%v\n", purgeCache.BaseURL+route, purgeCache.BaseURL, err)
		}
		httpRequest.Header.Set("Content-Type", "application/json")
		callSummary.HttpRequest = httpRequest
		// Refresh Authorization header with each call...
		// Only authenticate if client library user wishes to.
		if purgeCache.Authenticate {
			credentials := &hawk.Credentials{
				ID:   purgeCache.ClientId,
				Key:  purgeCache.AccessToken,
				Hash: sha256.New,
			}
			reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0)
			if purgeCache.Certificate != "" {
				reqAuth.Ext = base64.StdEncoding.EncodeToString([]byte("{\"certificate\":" + purgeCache.Certificate + "}"))
			}
			httpRequest.Header.Set("Authorization", reqAuth.RequestHeader())
		}
		debug("Making http request: %v", httpRequest)
		resp, err := httpClient.Do(httpRequest)
		return resp, err, nil
	}

	// Make HTTP API calls using an exponential backoff algorithm...
	callSummary.HttpResponse, callSummary.Attempts, err = httpbackoff.Retry(httpCall)

	if err != nil {
		return result, callSummary, err
	}

	// now read response into memory, so that we can return the body
	var body []byte
	body, err = ioutil.ReadAll(callSummary.HttpResponse.Body)

	if err != nil {
		return result, callSummary, err
	}

	callSummary.HttpResponseBody = string(body)

	// if result is passed in as nil, it means the API defines no response body
	// json
	if reflect.ValueOf(result).IsValid() && !reflect.ValueOf(result).IsNil() {
		err = json.Unmarshal([]byte(callSummary.HttpResponseBody), &result)
	}

	return result, callSummary, err
}

// The entry point into all the functionality in this package is to create a
// PurgeCache object.  It contains your authentication credentials, which are
// required for all HTTP operations.
type PurgeCache struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
	// The URL of the API endpoint to hit.
	// Use "https://purge-cache.taskcluster.net/v1" for production.
	// Please note calling purgecache.New(clientId string, accessToken string) is an
	// alternative way to create a PurgeCache object with BaseURL set to production.
	BaseURL string
	// Whether authentication is enabled (e.g. set to 'false' when using taskcluster-proxy)
	// Please note calling purgecache.New(clientId string, accessToken string) is an
	// alternative way to create a PurgeCache object with Authenticate set to true.
	Authenticate bool
	// Certificate for temporary credentials
	Certificate string
}

// CallSummary provides information about the underlying http request and
// response issued for a given API call.
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
	// Keep a record of how many http requests were attempted
	Attempts int
}

// Returns a pointer to PurgeCache, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false.
//
// For example:
//  purgeCache := purgecache.New("123", "456")                       // set clientId and accessToken
//  purgeCache.Authenticate = false                                  // disable authentication (true by default)
//  purgeCache.BaseURL = "http://localhost:1234/api/PurgeCache/v1"   // alternative API endpoint (production by default)
//  callSummary, err := purgeCache.PurgeCache(.....)                 // for example, call the PurgeCache(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(clientId string, accessToken string) *PurgeCache {
	return &PurgeCache{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://purge-cache.taskcluster.net/v1",
		Authenticate: true,
	}
}

// Stability: *** EXPERIMENTAL ***
//
// Publish a purge-cache message to purge caches named `cacheName` with
// `provisionerId` and `workerType` in the routing-key. Workers should
// be listening for this message and purge caches when they see it.
//
// Required scopes:
//   * purge-cache:<provisionerId>/<workerType>:<cacheName>
//
// See http://docs.taskcluster.net/services/purge-cache/#purgeCache
func (purgeCache *PurgeCache) PurgeCache(provisionerId string, workerType string, payload *PurgeCacheRequest) (*CallSummary, error) {
	_, callSummary, err := purgeCache.apiCall(payload, "POST", "/purge-cache/"+url.QueryEscape(provisionerId)+"/"+url.QueryEscape(workerType), nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/services/purge-cache/#ping
func (purgeCache *PurgeCache) Ping() (*CallSummary, error) {
	_, callSummary, err := purgeCache.apiCall(nil, "GET", "/ping", nil)
	return callSummary, err
}

type (

	// Request that a message be published to purge a specific cache.
	//
	// See http://schemas.taskcluster.net/purge-cache/v1/purge-cache-request.json#
	PurgeCacheRequest struct {

		// Name of cache to purge. Notice that if a `workerType` have multiple kinds
		// of caches (with independent names), it should purge all caches identified
		// by `cacheName` regardless of cache type.
		//
		// See http://schemas.taskcluster.net/purge-cache/v1/purge-cache-request.json#/properties/cacheName
		CacheName string `json:"cacheName"`
	}
)

// Wraps time.Time in order that json serialisation/deserialisation can be adapted.
// Marshaling time.Time types results in RFC3339 dates with nanosecond precision
// in the user's timezone. In order that the json date representation is consistent
// between what we send in json payloads, and what taskcluster services return,
// we wrap time.Time into type purgecache.Time which marshals instead
// to the same format used by the TaskCluster services; UTC based, with millisecond
// precision, using 'Z' timezone, e.g. 2015-10-27T20:36:19.255Z.
type Time time.Time

// MarshalJSON implements the json.Marshaler interface.
// The time is a quoted string in RFC 3339 format, with sub-second precision added if present.
func (t Time) MarshalJSON() ([]byte, error) {
	if y := time.Time(t).Year(); y < 0 || y >= 10000 {
		// RFC 3339 is clear that years are 4 digits exactly.
		// See golang.org/issue/4556#c15 for more discussion.
		return nil, errors.New("queue.Time.MarshalJSON: year outside of range [0,9999]")
	}
	return []byte(`"` + t.String() + `"`), nil
}

// UnmarshalJSON implements the json.Unmarshaler interface.
// The time is expected to be a quoted string in RFC 3339 format.
func (t *Time) UnmarshalJSON(data []byte) (err error) {
	// Fractional seconds are handled implicitly by Parse.
	x := new(time.Time)
	*x, err = time.Parse(`"`+time.RFC3339+`"`, string(data))
	*t = Time(*x)
	return
}

// Returns the Time in canonical RFC3339 representation, e.g.
// 2015-10-27T20:36:19.255Z
func (t Time) String() string {
	return time.Time(t).UTC().Format("2006-01-02T15:04:05.000Z")
}
