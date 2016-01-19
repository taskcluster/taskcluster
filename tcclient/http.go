package tcclient

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"reflect"
	"time"

	"github.com/taskcluster/httpbackoff"
	hawk "github.com/tent/hawk-go"
)

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

// utility function to create a URL object based on given data
func setURL(connectionData *ConnectionData, route string, query url.Values) (u *url.URL, err error) {
	u, err = url.Parse(connectionData.BaseURL + route)
	if err != nil {
		return nil, fmt.Errorf("Cannot parse url: '%v', is BaseURL (%v) set correctly?\n%v\n", connectionData.BaseURL+route, connectionData.BaseURL, err)
	}
	if query != nil {
		u.RawQuery = query.Encode()
	}
	return
}

// APICall is the generic REST API calling method which performs all REST API
// calls for this library.  Each auto-generated REST API method simply is a
// wrapper around this method, calling it with specific specific arguments.
func (connectionData *ConnectionData) APICall(payload interface{}, method, route string, result interface{}, query url.Values) (interface{}, *CallSummary, error) {
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
		u, err := setURL(connectionData, route, query)
		if err != nil {
			return nil, nil, fmt.Errorf("apiCall url cannot be parsed:\n%v\n", err)
		}
		httpRequest, err := http.NewRequest(method, u.String(), ioReader)
		if err != nil {
			return nil, nil, fmt.Errorf("Internal error: apiCall url cannot be parsed although thought to be valid: '%v', is the BaseURL (%v) set correctly?\n%v\n", u.String(), connectionData.BaseURL, err)
		}
		httpRequest.Header.Set("Content-Type", "application/json")
		callSummary.HttpRequest = httpRequest
		// Refresh Authorization header with each call...
		// Only authenticate if client library user wishes to.
		if connectionData.Authenticate {
			credentials := &hawk.Credentials{
				ID:   connectionData.Credentials.ClientId,
				Key:  connectionData.Credentials.AccessToken,
				Hash: sha256.New,
			}
			reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0)
			reqAuth.Ext, err = getExtHeader(connectionData.Credentials)
			if err != nil {
				return nil, nil, fmt.Errorf("Internal error: was not able to generate hawk ext header from provided credentials: %q\n%s", connectionData.Credentials, err)
			}
			httpRequest.Header.Set("Authorization", reqAuth.RequestHeader())
		}
		log.Printf("Making http request: %v", httpRequest)
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

// SignedURL creates a signed URL using the given ConnectionData, where route
// is the url path relative to the BaseURL stored in the ConnectionData, query
// is the set of query string parameters, if any, and duration is the amount of
// time that the signed URL should remain valid for.
func (connectionData *ConnectionData) SignedURL(route string, query url.Values, duration time.Duration) (u *url.URL, err error) {
	u, err = setURL(connectionData, route, query)
	if err != nil {
		return
	}
	credentials := &hawk.Credentials{
		ID:   connectionData.Credentials.ClientId,
		Key:  connectionData.Credentials.AccessToken,
		Hash: sha256.New,
	}
	reqAuth, err := hawk.NewURLAuth(u.String(), credentials, duration)
	if err != nil {
		return
	}
	reqAuth.Ext, err = getExtHeader(connectionData.Credentials)
	if err != nil {
		return
	}
	bewitSignature := reqAuth.Bewit()
	if query == nil {
		query = url.Values{}
	}
	query.Set("bewit", bewitSignature)
	u.RawQuery = query.Encode()
	return
}

// getExtHeader generates the hawk ext header based on the authorizedScopes and
// the certificate used in the case of temporary credentials. The header is a
// base64 encoded json object with a "certificate" property set to the
// certificate of the temporary credentials and a "authorizedScopes" property
// set to the array of authorizedScopes, if provided.  If either "certificate"
// or "authorizedScopes" is not supplied, they will be omitted from the json
// result. If neither are provided, an empty string is returned, rather than a
// base64 encoded representation of "null" or "{}". Hawk interpets the empty
// string as meaning the ext header is not needed.
//
// See:
//   * http://docs.taskcluster.net/auth/authorized-scopes
//   * http://docs.taskcluster.net/auth/temporary-credentials
func getExtHeader(credentials *Credentials) (header string, err error) {
	ext := &ExtHeader{}
	if credentials.Certificate != "" {
		certObj := new(Certificate)
		err = json.Unmarshal([]byte(credentials.Certificate), certObj)
		if err != nil {
			return "", err
		}
		ext.Certificate = certObj
	}

	if credentials.AuthorizedScopes != nil {
		ext.AuthorizedScopes = &credentials.AuthorizedScopes
	}
	extJson, err := json.Marshal(ext)
	if err != nil {
		return "", err
	}
	if string(extJson) != "{}" {
		return base64.StdEncoding.EncodeToString(extJson), nil
	}
	return "", nil
}

// ExtHeader represents the authentication/authorization data that is contained
// in the ext field inside the base64 decoded `Authorization` HTTP header in
// outgoing Hawk HTTP requests.
type ExtHeader struct {
	Certificate *Certificate `json:"certificate,omitempty"`
	// use pointer to slice to distinguish between nil slice and empty slice
	AuthorizedScopes *[]string `json:"authorizedScopes,omitempty"`
}
