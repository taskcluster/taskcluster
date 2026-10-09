package main

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
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

func TestUpstreamRequestCancelledWhenClientDisconnects(t *testing.T) {
	upstream, started, release := hungUpstream(t)
	routes := testRoutes(upstream.URL)
	handled := make(chan struct{})
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		routes.ServeHTTP(w, r)
		close(handled)
	}))
	defer upstream.Close()
	defer close(release)

	ctx, cancel := context.WithCancel(context.Background())
	req, err := http.NewRequestWithContext(ctx, "GET", proxy.URL+"/api/queue/v1/ping", nil)
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		res, err := http.DefaultClient.Do(req)
		if err == nil {
			res.Body.Close()
		}
	}()
	<-started
	cancel()

	select {
	case <-handled:
		proxy.Close()
	case <-time.After(5 * time.Second):
		// Don't close the proxy: Close would wait for the stuck handler.
		t.Fatal("proxy was still handling the request 5s after its client disconnected")
	}
}

// blackHoleListener hands out connections that can be frozen: once frozen,
// everything received is discarded, like a connection whose packets no
// longer reach their destination.
type blackHoleListener struct {
	net.Listener
	mu    sync.Mutex
	conns []*blackHoleConn
}

type blackHoleConn struct {
	net.Conn
	frozen atomic.Bool
}

func (l *blackHoleListener) Accept() (net.Conn, error) {
	c, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	conn := &blackHoleConn{Conn: c}
	l.mu.Lock()
	l.conns = append(l.conns, conn)
	l.mu.Unlock()
	return conn, nil
}

// freeze black-holes every connection accepted so far.
func (l *blackHoleListener) freeze() {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, c := range l.conns {
		c.frozen.Store(true)
	}
}

func (c *blackHoleConn) Read(b []byte) (int, error) {
	for {
		n, err := c.Conn.Read(b)
		if err != nil || !c.frozen.Load() {
			return n, err
		}
	}
}

func TestRequestRetriedWhenUpstreamConnectionGoesDead(t *testing.T) {
	var sawHTTP2 atomic.Bool
	upstream := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.ProtoMajor == 2 {
			sawHTTP2.Store(true)
		}
		_, _ = io.WriteString(w, "{}")
	}))
	listener := &blackHoleListener{Listener: upstream.Listener}
	upstream.Listener = listener
	upstream.EnableHTTP2 = true
	upstream.StartTLS()
	defer upstream.Close()

	savedClient := httpClient
	httpClient = newHTTPClient(100*time.Millisecond, 100*time.Millisecond)
	httpClient.Transport.(*http.Transport).TLSClientConfig = upstream.Client().Transport.(*http.Transport).TLSClientConfig
	defer func() { httpClient = savedClient }()

	proxy := newTestProxy(t, upstream.URL)
	defer proxy.Close()

	client := &http.Client{Timeout: 10 * time.Second}
	get := func(when string) {
		res, err := client.Get(proxy.URL + "/api/queue/v1/ping")
		if err != nil {
			t.Fatalf("request %s failed: %v", when, err)
		}
		res.Body.Close()
		if res.StatusCode != 200 {
			t.Fatalf("request %s returned %d", when, res.StatusCode)
		}
	}

	get("before the upstream connection went dead")
	if !sawHTTP2.Load() {
		t.Fatal("the proxy didn't use HTTP/2 for the upstream request")
	}

	listener.freeze()
	get("after the upstream connection went dead")
}
