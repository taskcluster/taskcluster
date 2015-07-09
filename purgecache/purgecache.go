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
// First create an authentication object:
//
//  Purgecache := purgecache.New("myClientId", "myAccessToken")
//
// and then call one or more of auth's methods, e.g.:
//
//  callSummary := Purgecache.PurgeCache(.....)
// handling any errors...
//  if callSummary.Error != nil {
//  	// handle error...
//  }
package purgecache

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
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("purgecache")
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
	// Use "https://purge-cache.taskcluster.net/v1" for production.
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
//  Purgecache := purgecache.New("123", "456")                       // set clientId and accessToken
//  Purgecache.Authenticate = false                                  // disable authentication (true by default)
//  Purgecache.BaseURL = "http://localhost:1234/api/PurgeCache/v1"   // alternative API endpoint (production by default)
//  callSummary := Purgecache.PurgeCache(.....)                      // for example, call the PurgeCache(.....) API endpoint (described further down)...
//  if callSummary.Error != nil {
//  	// handle errors...
//  }
func New(clientId string, accessToken string) *Auth {
	return &Auth{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://purge-cache.taskcluster.net/v1",
		Authenticate: true,
	}
}

// Publish a purge-cache message to purge caches named `cacheName` with
// `provisionerId` and `workerType` in the routing-key. Workers should
// be listening for this message and purge caches when they see it.
//
// See http://docs.taskcluster.net/services/purge-cache/#purgeCache
func (a *Auth) PurgeCache(provisionerId string, workerType string, payload *PurgeCacheRequest) *CallSummary {
	_, callSummary := a.apiCall(payload, "POST", "/purge-cache/"+provisionerId+"/"+workerType+"", nil)
	return callSummary
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/services/purge-cache/#ping
func (a *Auth) Ping() *CallSummary {
	_, callSummary := a.apiCall(nil, "GET", "/ping", nil)
	return callSummary
}

type (
	// Request that a message be published to purge a specific cache.
	//
	// See http://schemas.taskcluster.net/purge-cache/v1/purge-cache-request.json#
	PurgeCacheRequest struct {
		// Name of cache to purge. Notice that if a `workerType` have multiple kinds
		// of caches (with independent names), it should purge all caches identified
		// by `cacheName` regardless of cache type.
		CacheName string `json:"cacheName"`
	}
)
