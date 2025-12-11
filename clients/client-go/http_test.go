package tcclient

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/cenkalti/backoff/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v95/internal/jsontest"
)

func (c *Client) quickBackoff() {
	settings := backoff.NewExponentialBackOff()
	settings.MaxElapsedTime = 100 * time.Millisecond
	c.HTTPBackoffClient = &httpbackoff.Client{
		BackOffSettings: settings,
	}
}

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
	t.Helper()
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
	t.Helper()
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
		_, _ = w.Write([]byte(`{"value": "hello world"}`))
	}))
	defer s.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c := Client{
		RootURL:      s.URL,
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
		_, _ = w.Write([]byte(r.Header.Get("Content-Type")))
	}))
	defer s.Close()
	client := Client{
		RootURL:      s.URL,
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

// Verify that the client does not follow redirects and returns the body
func TestNoFollowRedirects(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header()["Location"] = []string{"http://nosuch.example.com"}
		w.WriteHeader(303)
		fmt.Fprintln(w, "{\"url\": \"http://nosuch.example.com\"}")
	}))
	defer s.Close()
	client := Client{
		RootURL:      s.URL,
		Authenticate: false,
	}

	var result map[string]any
	res, cs, err := client.APICall(nil, "GET", "/whatever", &result, nil)
	assert.NoError(t, err)
	assert.Equal(t, 303, cs.HTTPResponse.StatusCode)
	assert.Equal(t,
		&map[string]any{"url": "http://nosuch.example.com"},
		res)
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
	mockRequestBody, err := io.ReadAll(req.Body)
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
		Body:   io.NopCloser(&bytes.Buffer{}),
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
	RootURL         string
	ServiceName     string
	APIVersion      string
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
			RootURL:         "https://tc.example.com",
			ServiceName:     "testy",
			APIVersion:      "v2",
			RequestBody:     nil,
			Method:          "GET",
			Route:           "/a/b",
			QueryParameters: nil,
		},
		{
			RootURL:         "https://tc.example.com/", // trailing /
			ServiceName:     "testy",
			APIVersion:      "v2",
			RequestBody:     nil,
			Method:          "GET",
			Route:           "/a/b",
			QueryParameters: nil,
		},
		// test a request with a payload body and query string parameters
		{
			RootURL:         "https://tc.example.com",
			ServiceName:     "testy",
			APIVersion:      "v2",
			RequestBody:     []byte{1, 2, 3, 4, 5},
			Method:          "POST",
			Route:           "/a/b",
			QueryParameters: url.Values{"a": []string{"A", "B"}},
		},
	}

	expectedRequests := []MockHTTPRequest{
		{
			URL:    "https://tc.example.com/api/testy/v2/a/b",
			Method: "GET",
			Body:   []byte{},
		},
		{
			URL:    "https://tc.example.com/api/testy/v2/a/b",
			Method: "GET",
			Body:   []byte{},
		},
		{
			URL:    "https://tc.example.com/api/testy/v2/a/b?a=A&a=B",
			Method: "POST",
			Body:   []byte{1, 2, 3, 4, 5},
		},
	}

	mockHTTPClient := &MockHTTPClient{T: t}
	c := Client{
		Authenticate: false,
		HTTPClient:   mockHTTPClient,
	}
	for _, testCase := range testCases {
		c.RootURL = testCase.RootURL
		c.ServiceName = testCase.ServiceName
		c.APIVersion = testCase.APIVersion
		_, _ = c.Request(testCase.RequestBody, testCase.Method, testCase.Route, testCase.QueryParameters)
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

func TestSignedURL_FullURL(t *testing.T) {
	client := Client{
		Credentials: &Credentials{
			ClientID:    "test-signin",
			AccessToken: "fake-key",
		},
		RootURL:     "https://tc.example.com",
		ServiceName: "grapes",
		APIVersion:  "v2",
	}

	res, err := client.SignedURL("https://tc.example.com/api/barley/v1/foo/bar", url.Values{"param": []string{"p1"}}, time.Minute)
	if err != nil {
		t.Error(err)
		return
	}

	if res.Host != "tc.example.com" {
		t.Fatalf("Got unexpected host %s", res.Host)
		return
	}
	if res.Path != "/api/barley/v1/foo/bar" {
		t.Fatalf("Got unexpected path %s", res.Path)
		return
	}
	if res.Query()["param"][0] != "p1" {
		t.Fatalf("Got unexpected query %s", res.Query())
		return
	}

	_, ok := res.Query()["bewit"]
	if !ok {
		t.Fatalf("Query does not have a 'bewit'")
		return
	}
}

func TestSignedURL_PartialURL(t *testing.T) {
	client := Client{
		Credentials: &Credentials{
			ClientID:    "test-signin",
			AccessToken: "fake-key",
		},
		RootURL:     "https://tc.example.com",
		ServiceName: "grapes",
		APIVersion:  "v2",
	}

	res, err := client.SignedURL("foo/bar", url.Values{"param": []string{"p1"}}, time.Minute)
	if err != nil {
		t.Error(err)
		return
	}

	if res.Host != "tc.example.com" {
		t.Fatalf("Got unexpected host %s", res.Host)
		return
	}
	if res.Path != "/api/grapes/v2/foo/bar" {
		t.Fatalf("Got unexpected path %s", res.Path)
		return
	}
	if res.Query()["param"][0] != "p1" {
		t.Fatalf("Got unexpected query %s", res.Query())
		return
	}

	_, ok := res.Query()["bewit"]
	if !ok {
		t.Fatalf("Query does not have a 'bewit'")
		return
	}
}

func TestRetryFailure(t *testing.T) {
	// This mock service just returns 500's
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		_, _ = w.Write([]byte("{}"))
	}))
	defer s.Close()
	client := Client{
		RootURL:      s.URL,
		Authenticate: false,
	}
	client.quickBackoff()

	// Three following calls should have no Content-Header set since request body is empty
	// 1) calling APICall with a nil payload
	_, _, err := client.APICall(nil, "GET", "/whatever", nil, nil)
	require.Error(t, err)
}

// Make sure client doesn't crash when the server drops all incoming connections
// See https://github.com/taskcluster/taskcluster/issues/5666
func TestDroppedConnections(t *testing.T) {

	// Create a TCP listener on an available port
	// Below, ":0" means "find an available port"
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatalf("Cannot create listener: %v", err)
	}

	// Only the main go routine can call t.Fatal etc to fail the test, so
	// communicate failures back to main go routine via an error channel and
	// let it handle them.
	errChan := make(chan error)

	// Create a taskcluster client to connect to the listener, and configure it
	// accordingly.
	localPort := listener.Addr().(*net.TCPAddr).Port
	client := Client{
		RootURL:      fmt.Sprintf("http://127.0.0.1:%v", localPort),
		Authenticate: false,
	}
	client.quickBackoff()

	// Wait for client and listener go routines to complete before exiting test.
	var wg sync.WaitGroup
	wg.Add(2)

	// Listener to process connections in dedicated go routine, passing any
	// errors back to main go routine via the created error channel.
	go func() {
		defer wg.Done()
		for {
			// Unblocks on receiving data, or on listener.Close()
			conn, err := listener.Accept()
			if err != nil {
				// Allow error due to listener being closed
				switch e1 := err.(type) {
				case *net.OpError:
					// Note, poll.errNetClosing is an unexported type in an
					// internal package, so cannot perform regular type
					// assertion. Therefore resorting to rendering type as
					// a string and comparing string value.
					if fmt.Sprintf("%T", e1.Err) == "poll.errNetClosing" {
						return
					}
				}
				// All other errors are problems
				errChan <- fmt.Errorf("Cannot accept connection: %w", err)
				return
			}
			// Drop all connections, to simulate a network having a bad hair
			// day.
			err = conn.Close()
			if err != nil {
				errChan <- fmt.Errorf("Cannot close connection: %w", err)
				return
			}
		}
	}()

	// Execute API calls in a dedicated go routine too, to avoid deadlocks
	// since the main go routine needs to concurrently consume any errors that
	// may occur.
	go func() {
		defer wg.Done()
		defer func() {
			err = listener.Close()
			if err != nil {
				errChan <- fmt.Errorf("Cannot close listener: %w", err)
			}
		}()
		_, _, err = client.APICall(nil, "GET", "/whatever", nil, nil)
		if err == nil {
			errChan <- errors.New("Was expecting an error, but did not get one")
		}
	}()

	// In a separate go routine, wait for client and listener to complete and
	// then close the error channel. This way, the main go routine can consume
	// from the error channel without deadlocking if there is an error.
	go func() {
		wg.Wait()
		close(errChan)
	}()

	// Consume any errors that occur. If no error occurs, channel is closed by
	// above go routine, and for loop will exit with no iterations.
	for err := range errChan {
		t.Fatal(err)
	}
}
