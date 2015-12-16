// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/github/v1/api.json

// The github service, typically available at
// `github.taskcluster.net`, is responsible for publishing pulse
// messages in response to GitHub events.
//
// This document describes the API end-point for consuming GitHub
// web hooks
//
// See: http://docs.taskcluster.net/services/taskcluster-github
//
// How to use this package
//
// First create a Github object:
//
//  myGithub := github.New("myClientId", "myAccessToken")
//
// and then call one or more of myGithub's methods, e.g.:
//
//  callSummary, err := myGithub.GithubWebHookConsumer(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/github/v1/api.json together with the input and output schemas it references, downloaded on
// Wed, 16 Dec 2015 at 16:29:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package github

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
	debug = D.Debug("github")
)

// apiCall is the generic REST API calling method which performs all REST API
// calls for this library.  Each auto-generated REST API method simply is a
// wrapper around this method, calling it with specific specific arguments.
func (myGithub *Github) apiCall(payload interface{}, method, route string, result interface{}, query url.Values) (interface{}, *CallSummary, error) {
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
		u, err := url.Parse(myGithub.BaseURL + route)
		if err != nil {
			return nil, nil, fmt.Errorf("apiCall url cannot be parsed: '%v', is your BaseURL (%v) set correctly?\n%v\n", myGithub.BaseURL+route, myGithub.BaseURL, err)
		}
		if query != nil {
			u.RawQuery = query.Encode()
		}
		httpRequest, err := http.NewRequest(method, u.String(), ioReader)
		if err != nil {
			return nil, nil, fmt.Errorf("Internal error: apiCall url cannot be parsed although thought to be valid: '%v', is the BaseURL (%v) set correctly?\n%v\n", u.String(), myGithub.BaseURL, err)
		}
		httpRequest.Header.Set("Content-Type", "application/json")
		callSummary.HttpRequest = httpRequest
		// Refresh Authorization header with each call...
		// Only authenticate if client library user wishes to.
		if myGithub.Authenticate {
			credentials := &hawk.Credentials{
				ID:   myGithub.ClientId,
				Key:  myGithub.AccessToken,
				Hash: sha256.New,
			}
			reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0)
			if myGithub.Certificate != "" {
				reqAuth.Ext = base64.StdEncoding.EncodeToString([]byte("{\"certificate\":" + myGithub.Certificate + "}"))
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
// Github object.  It contains your authentication credentials, which are
// required for all HTTP operations.
type Github struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
	// The URL of the API endpoint to hit.
	// Use "https://taskcluster-github.herokuapp.com/v1" for production.
	// Please note calling github.New(clientId string, accessToken string) is an
	// alternative way to create a Github object with BaseURL set to production.
	BaseURL string
	// Whether authentication is enabled (e.g. set to 'false' when using taskcluster-proxy)
	// Please note calling github.New(clientId string, accessToken string) is an
	// alternative way to create a Github object with Authenticate set to true.
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

// Returns a pointer to Github, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false.
//
// For example:
//  myGithub := github.New("123", "456")                       // set clientId and accessToken
//  myGithub.Authenticate = false                              // disable authentication (true by default)
//  myGithub.BaseURL = "http://localhost:1234/api/Github/v1"   // alternative API endpoint (production by default)
//  callSummary, err := myGithub.GithubWebHookConsumer(.....)  // for example, call the GithubWebHookConsumer(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(clientId string, accessToken string) *Github {
	return &Github{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://taskcluster-github.herokuapp.com/v1",
		Authenticate: true,
	}
}

// Stability: ***  ***
//
// Capture a GitHub event and publish it via pulse, if it's a push
// or pull request.
//
// See http://docs.taskcluster.net/services/taskcluster-github/#githubWebHookConsumer
func (myGithub *Github) GithubWebHookConsumer() (*CallSummary, error) {
	_, callSummary, err := myGithub.apiCall(nil, "POST", "/github", nil, nil)
	return callSummary, err
}

// Stability: ***  ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/services/taskcluster-github/#ping
func (myGithub *Github) Ping() (*CallSummary, error) {
	_, callSummary, err := myGithub.apiCall(nil, "GET", "/ping", nil, nil)
	return callSummary, err
}

type ()

// Wraps time.Time in order that json serialisation/deserialisation can be adapted.
// Marshaling time.Time types results in RFC3339 dates with nanosecond precision
// in the user's timezone. In order that the json date representation is consistent
// between what we send in json payloads, and what taskcluster services return,
// we wrap time.Time into type github.Time which marshals instead
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
