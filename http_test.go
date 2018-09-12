package tcclient

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster-base-go/jsontest"
)

// TestExtHeaderPermAuthScopes checks that the generated hawk ext http header
// for permanent credentials with authorized scopes listed matches what is
// expected.
func TestExtHeaderPermAuthScopes(t *testing.T) {
	checkExtHeader(
		t,
		&Credentials{
			ClientID:         "abc",
			AccessToken:      "def",
			AuthorizedScopes: []string{"a", "b", "c"},
		},
		// base64 of `{"authorizedScopes":["a","b","c"]}`
		"eyJhdXRob3JpemVkU2NvcGVzIjpbImEiLCJiIiwiYyJdfQ==",
	)
}

// TestExtHeaderPermNilAuthScopes checks that when permanent credentials are
// provided and the Authorized Scopes are not set (i.e. are nil) that the hawk
// ext header is an empty string.
func TestExtHeaderPermNilAuthScopes(t *testing.T) {
	checkExtHeader(
		t,
		&Credentials{
			ClientID:    "abc",
			AccessToken: "def",
		},
		"",
	)
}

// TestExtHeaderPermNoAuthScopes checks that when permanent credentials are
// provided and an empty list of authorized scopes is used, that the hawk ext
// http header is explicitly showing an empty list of authorized scopes.
func TestExtHeaderPermNoAuthScopes(t *testing.T) {
	checkExtHeader(
		t,
		&Credentials{
			ClientID:         "abc",
			AccessToken:      "def",
			AuthorizedScopes: []string{},
		},
		// base64 of `{"authorizedScopes":[]}`
		"eyJhdXRob3JpemVkU2NvcGVzIjpbXX0=",
	)
}

// TestExtHeaderTempAuthScopes checks that the hawk ext header is set to the
// expected value when using temp credentials and an explicit list of
// authorized scopes.
func TestExtHeaderTempAuthScopes(t *testing.T) {
	checkExtHeaderTempCreds(
		t,
		&Credentials{
			ClientID:         "abc",
			AccessToken:      "def",
			AuthorizedScopes: []string{"a", "b", "c"},
		},
	)
}

// TestExtHeaderTempNilAuthScopes checks that the hawk ext header includes the
// temporary credentials certificate, but no authorized scopes property when
// using temp credentials but not restricting the authorized scopes.
func TestExtHeaderTempNilAuthScopes(t *testing.T) {
	checkExtHeaderTempCreds(
		t,
		&Credentials{
			ClientID:    "abc",
			AccessToken: "def",
		},
	)
}

// TestExtHeaderTempNoAuthScopes checks that the hawk ext header includes an
// empty list of authorized scopes when an empty list is provided, and that the
// temp credentials certificate is also included.
func TestExtHeaderTempNoAuthScopes(t *testing.T) {
	checkExtHeaderTempCreds(
		t,
		&Credentials{
			ClientID:         "abc",
			AccessToken:      "def",
			AuthorizedScopes: []string{},
		},
	)
}

type ExtHeaderRawCert struct {
	Certificate      json.RawMessage `json:"certificate"`
	AuthorizedScopes []string        `json:"authorizedScopes"`
}

// checkExtHeaderTempCreds generates temporary credentials from the given
// permanent credentials and then checks what the ext header looks like
// according to getExtHeader function. It base64 decodes the results, and then
// checks that the temporary credentials match the ones given, and then
// evaluates whether authorizedScopes is correct. It checks that if no
// authorized scopes were set, that the authorizedScopes are not set in the
// header; if they are set to anything, including an empty array, that this
// matches what is found in the header.
func checkExtHeaderTempCreds(t *testing.T, permCreds *Credentials) {
	tempCredentials, err := permCreds.CreateTemporaryCredentials(time.Second*1, "d", "e", "f")
	if err != nil {
		t.Fatalf("Received error when generating temporary credentials: %s", err)
	}
	actualHeader, err := getExtHeader(tempCredentials)
	if err != nil {
		t.Fatalf("Received error when generating ext header: %s", err)
	}
	decoded, err := base64.StdEncoding.DecodeString(actualHeader)
	if err != nil {
		t.Fatalf("Received error when base64 decoding ext header: %s", err)
	}
	extHeader := new(ExtHeaderRawCert)
	err = json.Unmarshal(decoded, extHeader)
	if err != nil {
		t.Fatalf("Cannot marshal results back into ExtHeader: %s", err)
	}
	if permCreds.AuthorizedScopes == nil {
		if strings.Contains(string(decoded), "authorizedScopes") {
			t.Fatalf("Did not expected authorizedScopes to be in ext header")
		}
	} else {
		if !reflect.DeepEqual(permCreds.AuthorizedScopes, extHeader.AuthorizedScopes) {
			t.Log("Expected AuthorizedScopes in Hawk Ext header to match AuthorizedScopes in credentials, but they didn't.")
			t.Logf("Expected: %q", permCreds.AuthorizedScopes)
			t.Logf("Actual: %q", extHeader.AuthorizedScopes)
			t.Logf("Full ext header: %s", string(decoded))
			t.FailNow()
		}
	}
	jsonCorrect, formattedExpected, formattedActual, err := jsontest.JsonEqual([]byte(tempCredentials.Certificate), extHeader.Certificate)
	if err != nil {
		t.Fatalf("Exception thrown formatting json data!\n%s\n\nStruggled to format either:\n%s\n\nor:\n\n%s", err, tempCredentials.Certificate, string(extHeader.Certificate))
	}

	if !jsonCorrect {
		t.Log("Anticipated json not generated. Expected:")
		t.Logf("%s", formattedExpected)
		t.Log("Actual:")
		t.Logf("%s", formattedActual)
		t.FailNow()
	}
}

// checkExtHeader simply checks if getExtHeader returns the same results as the
// specified expected header.
func checkExtHeader(t *testing.T, creds *Credentials, expectedHeader string) {
	actualHeader, err := getExtHeader(creds)
	if err != nil {
		t.Fatalf("Received error when generating ext header: %s", err)
	}
	if actualHeader != expectedHeader {
		t.Fatalf("Expected header %q but got %q", expectedHeader, actualHeader)
	}
}

func TestRequestWithContext(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(200)
		w.Write([]byte(`{"value": "hello world"}`))
	}))
	defer s.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c := Client{
		BaseURL:      s.URL,
		Authenticate: false,
		Context:      ctx,
	}

	// Make a call
	var result struct {
		Value string `json:"value"`
	}
	_, _, err := c.APICall(nil, "GET", "/whatever", &result, nil)
	if err != nil {
		t.Fatal("Unexpected error: ", err)
	}

	// Make a call and cancel
	time.AfterFunc(100*time.Millisecond, cancel)
	_, _, err = c.APICall(nil, "GET", "/whatever", &result, nil)
	if err == nil {
		t.Fatal("Should have had a cancel error")
	}
	if err != context.Canceled {
		t.Fatalf("Expected canceled error but got %T %v", err, err)
	}
}

// Make sure Content-Type is only set if there is a payload
func TestContentTypeHeader(t *testing.T) {
	// This mock service just returns the value of the Content-Type request
	// header in the response body so we can check what value it had.
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte(r.Header.Get("Content-Type")))
	}))
	defer s.Close()
	client := Client{
		BaseURL:      s.URL,
		Authenticate: false,
	}

	// Three following calls should have no Content-Header set since request body is empty
	// 1) calling APICall with a nil payload
	_, cs, err := client.APICall(nil, "GET", "/whatever", nil, nil)
	if err != nil {
		t.Errorf("Unexpected error: %s", err)
	}
	if ct := cs.HTTPResponseBody; ct != "" {
		t.Errorf("Expected no Content-Type header, but got '%v'", ct)
	}
	// 2) calling Request with nil body
	cs, err = client.Request(nil, "GET", "/whatever", nil)
	if err != nil {
		t.Errorf("Unexpected error: %s", err)
	}
	if ct := cs.HTTPResponseBody; ct != "" {
		t.Errorf("Expected no Content-Type header, but got '%v'", ct)
	}
	// 3) calling Request with array of 0 bytes for body
	cs, err = client.Request([]byte{}, "GET", "/whatever", nil)
	if err != nil {
		t.Errorf("Unexpected error: %s", err)
	}
	if ct := cs.HTTPResponseBody; ct != "" {
		t.Errorf("Expected no Content-Type header, but got '%v'", ct)
	}

	// This tests that given a payload > 0 bytes, Content-Type is set
	cs, err = client.Request([]byte("{}"), "PUT", "/whatever", nil)
	if err != nil {
		t.Errorf("Unexpected error: %s", err)
	}
	if ct := cs.HTTPResponseBody; ct != "application/json" {
		t.Errorf("Expected Content-Type application/json header, but got '%v'", ct)
	}
}

type MockHTTPClient struct {
	mu       sync.Mutex
	requests []MockHTTPRequest
	T        *testing.T
}

type MockHTTPRequest struct {
	URL    string
	Method string
	Body   []byte
}

func (m *MockHTTPClient) Do(req *http.Request) (*http.Response, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	mockRequestBody, err := ioutil.ReadAll(req.Body)
	if err != nil {
		m.T.Fatalf("Hit error reading mock http request request body: %s", err)
	}
	mockRequest := MockHTTPRequest{
		URL:    req.URL.String(),
		Method: req.Method,
		Body:   mockRequestBody,
	}
	if m.requests == nil {
		m.requests = []MockHTTPRequest{mockRequest}
	} else {
		m.requests = append(m.requests, mockRequest)
	}
	return &http.Response{
		Status: "200 OK",
		Body:   ioutil.NopCloser(&bytes.Buffer{}),
	}, nil
}

// Requests returns an array of all http requests made since this method was
// last called.
func (m *MockHTTPClient) Requests() []MockHTTPRequest {
	m.mu.Lock()
	defer m.mu.Unlock()
	defer func() {
		m.requests = nil
	}()
	return m.requests
}

type RequestTestCase struct {
	BaseURL         string
	RequestBody     []byte
	Method          string
	Route           string
	QueryParameters url.Values
}

func TestHTTPRequestGeneration(t *testing.T) {

	testCases := []RequestTestCase{
		// routes should always start with '/', however base URLs can be
		// configured by user, so we should test with both trailing and
		// non-trailing slash; see https://bugzil.la/1484702
		{
			BaseURL:         "https://queue.taskcluster.net/v1",
			RequestBody:     nil,
			Method:          "GET",
			Route:           "/a/b",
			QueryParameters: nil,
		},
		{
			BaseURL:         "https://my.taskcluster.queue.deployment/v1/",
			RequestBody:     nil,
			Method:          "GET",
			Route:           "/a/b",
			QueryParameters: nil,
		},
		// test a request with a payload body and query string parameters
		{
			BaseURL:         "https://my.taskcluster.queue.deployment/v1/",
			RequestBody:     []byte{1, 2, 3, 4, 5},
			Method:          "POST",
			Route:           "/a/b",
			QueryParameters: url.Values{"a": []string{"A", "B"}},
		},
		// fully qualified routes with empty base urls are used by
		// taskcluster-proxy
		{
			BaseURL:         "",
			RequestBody:     nil,
			Method:          "GET",
			Route:           "https://localhost:12345/a/b",
			QueryParameters: nil,
		},
	}

	expectedRequests := []MockHTTPRequest{
		{
			URL:    "https://queue.taskcluster.net/v1/a/b",
			Method: "GET",
			Body:   []byte{},
		},
		{
			URL:    "https://my.taskcluster.queue.deployment/v1/a/b",
			Method: "GET",
			Body:   []byte{},
		},
		{
			URL:    "https://my.taskcluster.queue.deployment/v1/a/b?a=A&a=B",
			Method: "POST",
			Body:   []byte{1, 2, 3, 4, 5},
		},
		{
			URL:    "https://localhost:12345/a/b",
			Method: "GET",
			Body:   []byte{},
		},
	}

	mockHTTPClient := &MockHTTPClient{T: t}
	c := Client{
		Authenticate: false,
		HTTPClient:   mockHTTPClient,
	}
	for _, testCase := range testCases {
		c.BaseURL = testCase.BaseURL
		c.Request(testCase.RequestBody, testCase.Method, testCase.Route, testCase.QueryParameters)
	}
	actualRequests := mockHTTPClient.Requests()

	if !reflect.DeepEqual(expectedRequests, actualRequests) {
		t.Log("Expected requests:")
		t.Logf("%#v", expectedRequests)
		t.Log("Actual requests:")
		t.Logf("%#v", actualRequests)
		t.Fail()
	}
}
