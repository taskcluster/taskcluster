// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/secrets/v1/api.json

// The secrets service, typically available at
// `tools.taskcluster.net`, is responsible for managing
// secure data in TaskCluster.
//
// See: http://docs.taskcluster.net/services/secrets
//
// How to use this package
//
// First create a Secrets object:
//
//  mySecrets := secrets.New("myClientId", "myAccessToken")
//
// and then call one or more of mySecrets's methods, e.g.:
//
//  callSummary := mySecrets.Set(.....)
// handling any errors...
//  if callSummary.Error != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/secrets/v1/api.json together with the input and output schemas it references, downloaded on
// Thu, 26 Nov 2015 at 14:56:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package secrets

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
	debug = D.Debug("secrets")
)

// apiCall is the generic REST API calling method which performs all REST API
// calls for this library.  Each auto-generated REST API method simply is a
// wrapper around this method, calling it with specific specific arguments.
func (mySecrets *Secrets) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *CallSummary) {
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
		httpRequest, err := http.NewRequest(method, mySecrets.BaseURL+route, ioReader)
		if err != nil {
			return nil, nil, fmt.Errorf("apiCall url cannot be parsed: '%v', is your BaseURL (%v) set correctly?\n%v\n", mySecrets.BaseURL+route, mySecrets.BaseURL, err)
		}
		httpRequest.Header.Set("Content-Type", "application/json")
		callSummary.HttpRequest = httpRequest
		// Refresh Authorization header with each call...
		// Only authenticate if client library user wishes to.
		if mySecrets.Authenticate {
			credentials := &hawk.Credentials{
				ID:   mySecrets.ClientId,
				Key:  mySecrets.AccessToken,
				Hash: sha256.New,
			}
			reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0)
			if mySecrets.Certificate != "" {
				reqAuth.Ext = base64.StdEncoding.EncodeToString([]byte("{\"certificate\":" + mySecrets.Certificate + "}"))
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

// The entry point into all the functionality in this package is to create a
// Secrets object.  It contains your authentication credentials, which are
// required for all HTTP operations.
type Secrets struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
	// The URL of the API endpoint to hit.
	// Use "https://secrets.taskcluster.net/v1" for production.
	// Please note calling secrets.New(clientId string, accessToken string) is an
	// alternative way to create a Secrets object with BaseURL set to production.
	BaseURL string
	// Whether authentication is enabled (e.g. set to 'false' when using taskcluster-proxy)
	// Please note calling secrets.New(clientId string, accessToken string) is an
	// alternative way to create a Secrets object with Authenticate set to true.
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

// Returns a pointer to Secrets, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false.
//
// For example:
//  mySecrets := secrets.New("123", "456")                       // set clientId and accessToken
//  mySecrets.Authenticate = false                               // disable authentication (true by default)
//  mySecrets.BaseURL = "http://localhost:1234/api/Secrets/v1"   // alternative API endpoint (production by default)
//  callSummary := mySecrets.Set(.....)                          // for example, call the Set(.....) API endpoint (described further down)...
//  if callSummary.Error != nil {
//  	// handle errors...
//  }
func New(clientId string, accessToken string) *Secrets {
	return &Secrets{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://secrets.taskcluster.net/v1",
		Authenticate: true,
	}
}

// Stability: *** EXPERIMENTAL ***
//
// Set a secret associated with some key.
//
// Required scopes:
//   * secrets:set:<name>
//
// See http://docs.taskcluster.net/services/secrets/#set
func (mySecrets *Secrets) Set(name string, payload *ATaskClusterSecret) *CallSummary {
	_, callSummary := mySecrets.apiCall(payload, "PUT", "/secrets/"+url.QueryEscape(name), nil)
	return callSummary
}

// Stability: *** EXPERIMENTAL ***
//
// Update a secret associated with some key.
//
// Required scopes:
//   * secrets:update:<name>
//
// See http://docs.taskcluster.net/services/secrets/#update
func (mySecrets *Secrets) Update(name string, payload *ATaskClusterSecret) *CallSummary {
	_, callSummary := mySecrets.apiCall(payload, "POST", "/secrets/"+url.QueryEscape(name), nil)
	return callSummary
}

// Stability: *** EXPERIMENTAL ***
//
// Delete the secret attached to some key.
//
// Required scopes:
//   * secrets:remove:<name>
//
// See http://docs.taskcluster.net/services/secrets/#remove
func (mySecrets *Secrets) Remove(name string) *CallSummary {
	_, callSummary := mySecrets.apiCall(nil, "DELETE", "/secrets/"+url.QueryEscape(name), nil)
	return callSummary
}

// Stability: *** EXPERIMENTAL ***
//
// Read the secret attached to some key.
//
// Required scopes:
//   * secrets:get:<name>
//
// See http://docs.taskcluster.net/services/secrets/#get
func (mySecrets *Secrets) Get(name string) (*ATaskClusterSecret, *CallSummary) {
	responseObject, callSummary := mySecrets.apiCall(nil, "GET", "/secrets/"+url.QueryEscape(name), new(ATaskClusterSecret))
	return responseObject.(*ATaskClusterSecret), callSummary
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/services/secrets/#ping
func (mySecrets *Secrets) Ping() *CallSummary {
	_, callSummary := mySecrets.apiCall(nil, "GET", "/ping", nil)
	return callSummary
}

type (

	// Message containing a TaskCluster Secret
	//
	// See http://schemas.taskcluster.net/secrets/v1/secret.json#
	ATaskClusterSecret struct {

		// An expiration date for this secret.
		//
		// See http://schemas.taskcluster.net/secrets/v1/secret.json#/properties/expires
		Expires Time `json:"expires"`

		// The secret value to be encrypted.
		//
		// See http://schemas.taskcluster.net/secrets/v1/secret.json#/properties/secret
		Secret json.RawMessage `json:"secret"`
	}
)

// Wraps time.Time in order that json serialisation/deserialisation can be adapted.
// Marshaling time.Time types results in RFC3339 dates with nanosecond precision
// in the user's timezone. In order that the json date representation is consistent
// between what we send in json payloads, and what taskcluster services return,
// we wrap time.Time into type secrets.Time which marshals instead
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
