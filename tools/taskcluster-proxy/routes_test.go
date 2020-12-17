package main

import (
	"bytes"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	tcclient "github.com/taskcluster/taskcluster/v39/clients/client-go"
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
		"http://localhost:60024/api/redirector/v1/redirect-me",
		new(bytes.Buffer),
	)
	assert.NoError(t, err)

	// see how it gets handled..
	res := httptest.NewRecorder()
	routes.RootHandler(res, req)

	// it should have returned the 303 directly, along with its body
	assert.Equal(t, 303, res.Code)
	respBody, err := ioutil.ReadAll(res.Body)
	assert.NoError(t, err)
	assert.Equal(t, "{}\n", string(respBody))
}
