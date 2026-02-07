package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
)

func TestHttpRedirects(t *testing.T) {
	// set up an upstream server that will return a redirect
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header()["Location"] = []string{"http://nosuch.example.com"}
		w.WriteHeader(http.StatusSeeOther)
		fmt.Fprintln(w, "{}")
	}))
	defer ts.Close()

	// set up a routes object to test, using the test server as RootURL
	routes := NewRoutes(
		tcclient.Client{
			Authenticate: true,
			RootURL:      ts.URL,
			Credentials: &tcclient.Credentials{
				ClientID:    "some-client",
				AccessToken: "doesn't-matter",
			},
		},
		"",
	)

	// create a fake request to the proxy
	req, err := http.NewRequest(
		"GET",
		"http://localhost:60024/redirector/v1/redirect-me",
		new(bytes.Buffer),
	)
	assert.NoError(t, err)

	// see how it gets handled..
	res := httptest.NewRecorder()
	routes.ServeHTTP(res, req)

	// it should have returned the 303 directly, along with its body
	assert.Equal(t, 303, res.Code)
	respBody, err := io.ReadAll(res.Body)
	assert.NoError(t, err)
	assert.Equal(t, "{}\n", string(respBody))
}

func TestNonCanonicalUrls(t *testing.T) {
	// set up an upstream server that returns its path
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprintf(w, "%s", r.URL)
	}))
	defer ts.Close()

	// set up a routes object to test, using the test server as RootURL
	routes := NewRoutes(
		tcclient.Client{
			Authenticate: true,
			RootURL:      ts.URL,
			Credentials: &tcclient.Credentials{
				ClientID:    "some-client",
				AccessToken: "doesn't-matter",
			},
		},
		"",
	)

	// create a fake request to the proxy
	req, err := http.NewRequest(
		"GET",
		"http://localhost:60024/queue/v1/double//slash/encode1%2F/encode2%252F/encode3%25252F",
		new(bytes.Buffer),
	)
	assert.NoError(t, err)

	// see how it gets handled..
	res := httptest.NewRecorder()
	routes.ServeHTTP(res, req)

	// it should have returned the path with `/api` but otherwise unchanged
	assert.Equal(t, 200, res.Code)
	respBody, err := io.ReadAll(res.Body)
	assert.NoError(t, err)
	assert.Equal(t, "/api/queue/v1/double//slash/encode1%2F/encode2%252F/encode3%25252F", string(respBody))
}

func newSecretTestRoutes(secret string) Routes {
	return NewRoutes(
		tcclient.Client{
			Authenticate: true,
			RootURL:      "http://localhost",
			Credentials: &tcclient.Credentials{
				ClientID:    "test-client",
				AccessToken: "test-token",
			},
		},
		secret,
	)
}

func TestSecretRequired(t *testing.T) {
	routes := newSecretTestRoutes("mysecret")

	req := httptest.NewRequest("GET", "/api/queue/v1/ping", new(bytes.Buffer))
	res := httptest.NewRecorder()
	routes.ServeHTTP(res, req)
	assert.Equal(t, 403, res.Code)
}

func TestSecretWrongValue(t *testing.T) {
	routes := newSecretTestRoutes("mysecret")

	req := httptest.NewRequest("GET", "/api/queue/v1/ping", new(bytes.Buffer))
	req.Header.Set("Authorization", "Bearer wrongsecret")
	res := httptest.NewRecorder()
	routes.ServeHTTP(res, req)
	assert.Equal(t, 403, res.Code)
}

func TestSecretAccepted(t *testing.T) {
	// set up an upstream server that returns its path
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprintf(w, "%s", r.URL)
	}))
	defer ts.Close()

	routes := NewRoutes(
		tcclient.Client{
			Authenticate: true,
			RootURL:      ts.URL,
			Credentials: &tcclient.Credentials{
				ClientID:    "some-client",
				AccessToken: "doesn't-matter",
			},
		},
		"mysecret",
	)

	req := httptest.NewRequest("GET", "/queue/v1/ping", new(bytes.Buffer))
	req.Header.Set("Authorization", "Bearer mysecret")
	res := httptest.NewRecorder()
	routes.ServeHTTP(res, req)
	assert.Equal(t, 200, res.Code)
	respBody, err := io.ReadAll(res.Body)
	assert.NoError(t, err)
	assert.Equal(t, "/api/queue/v1/ping", string(respBody))
}

func TestSecretWithAPIPath(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprintf(w, "%s", r.URL)
	}))
	defer ts.Close()

	routes := NewRoutes(
		tcclient.Client{
			Authenticate: true,
			RootURL:      ts.URL,
			Credentials: &tcclient.Credentials{
				ClientID:    "some-client",
				AccessToken: "doesn't-matter",
			},
		},
		"mysecret",
	)

	req := httptest.NewRequest("GET", "/api/queue/v1/task/abc123", new(bytes.Buffer))
	req.Header.Set("Authorization", "Bearer mysecret")
	res := httptest.NewRecorder()
	routes.ServeHTTP(res, req)
	assert.Equal(t, 200, res.Code)
	respBody, err := io.ReadAll(res.Body)
	assert.NoError(t, err)
	assert.Equal(t, "/api/queue/v1/task/abc123", string(respBody))
}

func TestNoSecretConfigured(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprintf(w, "%s", r.URL)
	}))
	defer ts.Close()

	routes := NewRoutes(
		tcclient.Client{
			Authenticate: true,
			RootURL:      ts.URL,
			Credentials: &tcclient.Credentials{
				ClientID:    "some-client",
				AccessToken: "doesn't-matter",
			},
		},
		"",
	)

	// Without a secret configured, requests should work normally
	req := httptest.NewRequest("GET", "/queue/v1/ping", new(bytes.Buffer))
	res := httptest.NewRecorder()
	routes.ServeHTTP(res, req)
	assert.Equal(t, 200, res.Code)
}
