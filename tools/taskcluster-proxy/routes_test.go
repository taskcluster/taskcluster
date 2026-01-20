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
