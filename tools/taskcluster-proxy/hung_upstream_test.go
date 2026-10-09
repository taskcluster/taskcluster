package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v113/clients/client-go"
)

// hungUpstream returns an upstream server that never responds until release
// is closed, or the request is cancelled, signalling on started when a
// request arrives.
func hungUpstream(t *testing.T) (ts *httptest.Server, started, release chan struct{}) {
	t.Helper()
	started = make(chan struct{}, 100)
	release = make(chan struct{})
	ts = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started <- struct{}{}
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	return
}

func testRoutes(rootURL string) *Routes {
	routes := NewRoutes(
		tcclient.Client{
			Authenticate: true,
			RootURL:      rootURL,
			Credentials: &tcclient.Credentials{
				ClientID:    "some-client",
				AccessToken: "doesn't-matter",
			},
		},
	)
	return &routes
}

func newTestProxy(t *testing.T, rootURL string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(testRoutes(rootURL))
}

func TestCredentialsUpdateNotBlockedByPendingRequest(t *testing.T) {
	upstream, started, release := hungUpstream(t)
	proxy := newTestProxy(t, upstream.URL)
	defer upstream.Close()
	defer proxy.Close()
	defer close(release)

	go func() {
		res, err := http.Get(proxy.URL + "/api/queue/v1/ping")
		if err == nil {
			res.Body.Close()
		}
	}()
	<-started

	body := []byte(`{"clientId":"new-client","accessToken":"new-token","certificate":""}`)
	req, err := http.NewRequest("PUT", proxy.URL+"/credentials", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Timeout: 5 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("credentials update blocked by a pending upstream request: %v", err)
	}
	res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("credentials update returned %d", res.StatusCode)
	}
}
