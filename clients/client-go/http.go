package tcclient

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"strings"

	// "net/http/httputil"
	"net/url"
	"reflect"
	"time"

	"github.com/taskcluster/httpbackoff"
	hawk "github.com/tent/hawk-go"
)

// CallSummary provides information about the underlying http request and
// response issued for a given API call.
type CallSummary struct {
	HTTPRequest *http.Request
	// Keep a copy of request body in addition to the *http.Request, since
	// accessing the Body via the *http.Request object, you get a io.ReadCloser
	// - and after the request has been made, the body will have been read, and
	// the data lost... This way, it is still available after the api call
	// returns.
	HTTPRequestBody string
	// The Go Type which is marshaled into json and used as the http request
	// body.
	HTTPRequestObject interface{}
	HTTPResponse      *http.Response
	// Keep a copy of response body in addition to the *http.Response, since
	// accessing the Body via the *http.Response object, you get a
	// io.ReadCloser - and after the response has been read once (to unmarshal
	// json into native go types) the data is lost... This way, it is still
	// available after the api call returns.
	HTTPResponseBody string
	// Keep a record of how many http requests were attempted
	Attempts int
}

func (cs *CallSummary) String() string {
	s := "\nCALL SUMMARY\n============\n"
	if req := cs.HTTPRequest; req != nil {
		s += fmt.Sprintf("Method: %v\n", req.Method)
		if req.URL != nil {
			s += fmt.Sprintf("URL: %v\n", req.URL)
		}
		s += fmt.Sprintf("Request Headers:\n%#v\n", req.Header)
	}
	s += fmt.Sprintf("Request Body:\n%v\n", cs.HTTPRequestBody)
	if resp := cs.HTTPResponse; resp != nil {
		s += fmt.Sprintf("Response Headers:\n%#v\n", cs.HTTPResponse.Header)
	}
	s += fmt.Sprintf("Response Body:\n%v\n", cs.HTTPResponseBody)
	s += fmt.Sprintf("Attempts: %v", cs.Attempts)
	return s
}

type APICall struct {
	Client      *Client
	Route       string
	QueryString url.Values
	Payload     io.Reader
}

// ReducedHTTPClient is the interface that wraps the functionality of
// http.Client that we actually use in Client.APICall.
type ReducedHTTPClient interface {
	Do(req *http.Request) (*http.Response, error)
}

// defaultHTTPClient is the HTTP Client used to make requests if none are
// defined in the client.
// A single object is created and used because http.Client is thread-safe when
// making multiple requests in various goroutines.
var defaultHTTPClient ReducedHTTPClient = &http.Client{}

// utility function to create a URL object based on given data
func setURL(client *Client, route string, query url.Values) (u *url.URL, err error) {
	URL := client.BaseURL
	// See https://bugzil.la/1484702
	// Avoid double separator; routes must start with `/`, so baseURL shouldn't
	// end with `/`.
	if strings.HasSuffix(URL, "/") {
		URL = URL[:len(URL)-1]
	}
	URL += route
	u, err = url.Parse(URL)
	if err != nil {
		return nil, fmt.Errorf("Cannot parse url: '%v', is BaseURL (%v) set correctly?\n%v\n", URL, client.BaseURL, err)
	}
	if query != nil {
		u.RawQuery = query.Encode()
	}
	return
}

// Request is the underlying method that makes a raw API request, without
// performing any json marshaling/unmarshaling of requests/responses. It is
// useful if you wish to handle raw payloads and/or raw http response bodies,
// rather than calling APICall which translates []byte to/from go types.
func (client *Client) Request(rawPayload []byte, method, route string, query url.Values) (*CallSummary, error) {
	callSummary := new(CallSummary)
	callSummary.HTTPRequestBody = string(rawPayload)

	// function to perform http request - we call this using backoff library to
	// have exponential backoff in case of intermittent failures (e.g. network
	// blips or HTTP 5xx errors)
	httpCall := func() (*http.Response, error, error) {
		var ioReader io.Reader
		ioReader = bytes.NewReader(rawPayload)
		u, err := setURL(client, route, query)
		if err != nil {
			return nil, nil, fmt.Errorf("apiCall url cannot be parsed:\n%v\n", err)
		}
		callSummary.HTTPRequest, err = http.NewRequest(method, u.String(), ioReader)
		if err != nil {
			return nil, nil, fmt.Errorf("Internal error: apiCall url cannot be parsed although thought to be valid: '%v', is the BaseURL (%v) set correctly?\n%v\n", u.String(), client.BaseURL, err)
		}
		if len(rawPayload) > 0 {
			callSummary.HTTPRequest.Header.Set("Content-Type", "application/json")
		}
		// Refresh Authorization header with each call...
		// Only authenticate if client library user wishes to.
		if client.Authenticate {
			err = client.Credentials.SignRequest(callSummary.HTTPRequest)
			if err != nil {
				return nil, nil, err
			}
		}
		// Set context if one is given
		if client.Context != nil {
			callSummary.HTTPRequest = callSummary.HTTPRequest.WithContext(client.Context)
		}
		var resp *http.Response
		if client.HTTPClient != nil {
			resp, err = client.HTTPClient.Do(callSummary.HTTPRequest)
		} else {
			resp, err = defaultHTTPClient.Do(callSummary.HTTPRequest)
		}
		// return cancelled error, if context was cancelled
		if client.Context != nil && client.Context.Err() != nil {
			return nil, nil, client.Context.Err()
		}
		// b, e := httputil.DumpResponse(resp, true)
		// if e == nil {
		// 	fmt.Println(string(b))
		// }
		return resp, err, nil
	}

	// Make HTTP API calls using an exponential backoff algorithm...
	var err error
	callSummary.HTTPResponse, callSummary.Attempts, err = httpbackoff.Retry(httpCall)

	// read response into memory, so that we can return the body
	if callSummary.HTTPResponse != nil {
		body, err2 := ioutil.ReadAll(callSummary.HTTPResponse.Body)
		if err2 == nil {
			callSummary.HTTPResponseBody = string(body)
		}
	}

	return callSummary, err

}

// SignRequest will add an Authorization header
func (c *Credentials) SignRequest(req *http.Request) (err error) {
	// s, err := c.SignHeader(req.Method, req.URL.String(), hash)
	// req.Header.Set("Authorization", s)
	// return err

	credentials := &hawk.Credentials{
		ID:   c.ClientID,
		Key:  c.AccessToken,
		Hash: sha256.New,
	}
	reqAuth := hawk.NewRequestAuth(req, credentials, 0)
	reqAuth.Ext, err = getExtHeader(c)
	if err != nil {
		return fmt.Errorf("Internal error: was not able to generate hawk ext header from provided credentials:\n%s\n%s", c, err)
	}
	req.Header.Set("Authorization", reqAuth.RequestHeader())
	return nil
}

type APICallException struct {
	CallSummary *CallSummary
	RootCause   error
}

func (err *APICallException) Error() string {
	return err.CallSummary.String() + "\n" + err.RootCause.Error()
}

// APICall is the generic REST API calling method which performs all REST API
// calls for this library.  Each auto-generated REST API method simply is a
// wrapper around this method, calling it with specific specific arguments.
func (client *Client) APICall(payload interface{}, method, route string, result interface{}, query url.Values) (interface{}, *CallSummary, error) {
	rawPayload := []byte{}
	var err error
	if reflect.ValueOf(payload).IsValid() && !reflect.ValueOf(payload).IsNil() {
		rawPayload, err = json.Marshal(payload)
		if err != nil {
			cs := &CallSummary{
				HTTPRequestObject: payload,
			}
			return result,
				cs,
				&APICallException{
					CallSummary: cs,
					RootCause:   err,
				}
		}
	}
	callSummary, err := client.Request(rawPayload, method, route, query)
	callSummary.HTTPRequestObject = payload
	if err != nil {
		// If context failed during this request, then we should just return that error
		if client.Context != nil && client.Context.Err() != nil {
			return result, callSummary, client.Context.Err()
		}
		return result,
			callSummary,
			&APICallException{
				CallSummary: callSummary,
				RootCause:   err,
			}
	}
	// if result is passed in as nil, it means the API defines no response body
	// json
	if reflect.ValueOf(result).IsValid() && !reflect.ValueOf(result).IsNil() {
		err = json.Unmarshal([]byte(callSummary.HTTPResponseBody), &result)
	}

	if err != nil {
		return result,
			callSummary,
			&APICallException{
				CallSummary: callSummary,
				RootCause:   err,
			}
	}
	return result, callSummary, nil
}

// SignedURL creates a signed URL using the given Client, where route is the
// url path relative to the BaseURL stored in the Client, query is the set of
// query string parameters, if any, and duration is the amount of time that the
// signed URL should remain valid for.
func (client *Client) SignedURL(route string, query url.Values, duration time.Duration) (u *url.URL, err error) {
	u, err = setURL(client, route, query)
	if err != nil {
		return
	}
	credentials := &hawk.Credentials{
		ID:   client.Credentials.ClientID,
		Key:  client.Credentials.AccessToken,
		Hash: sha256.New,
	}
	reqAuth, err := hawk.NewURLAuth(u.String(), credentials, duration)
	if err != nil {
		return
	}
	reqAuth.Ext, err = getExtHeader(client.Credentials)
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
// base64 encoded representation of "null" or "{}". Hawk interprets the empty
// string as meaning the ext header is not needed.
//
// See:
//   * https://docs.taskcluster.net/docs/manual/design/apis/hawk/authorized-scopes
//   * https://docs.taskcluster.net/docs/manual/design/apis/hawk/temporary-credentials
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
	extJSON, err := json.Marshal(ext)
	if err != nil {
		return "", err
	}
	if string(extJSON) != "{}" {
		return base64.StdEncoding.EncodeToString(extJSON), nil
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
