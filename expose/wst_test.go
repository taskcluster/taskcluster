package expose

import (
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	jwt "github.com/dgrijalva/jwt-go"
	"github.com/gorilla/websocket"
	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster-client-go/tcauth"
	"github.com/taskcluster/websocktunnel/wsproxy"
)

const WST_SECRET = "sshhh!"
const WST_AUDIENCE = "testing"
const WST_WORKER_GROUP = "expose-tests"
const WST_WORKER_ID = "t1"

// A fake authClient implementation that can generate fake tokens
type fakeAuth struct{}

func (fa fakeAuth) WebsocktunnelToken(wstAudience, wstClientId string) (*tcauth.WebsocktunnelTokenResponse, error) {
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"tid": wstClientId,
		"iat": time.Now().Unix(),
		"nbf": time.Now().Add(-1 * time.Minute).Unix(),
		"exp": time.Now().Add(1 * time.Minute).Unix(),
		"aud": WST_AUDIENCE,
	}).SignedString([]byte(WST_SECRET))
	if err != nil {
		return nil, err
	}

	return &tcauth.WebsocktunnelTokenResponse{
		Token: token,
	}, nil
}

// Encapsulation of a websocktunnel server with a close method
type wstServer struct {
	t        *testing.T
	listener net.Listener
	port     uint16
	handler  http.Handler
	server   *http.Server
}

func makeWstServer(t *testing.T) wstServer {
	listener, port, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}

	logger := logrus.New()
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	handler, err := wsproxy.New(wsproxy.Config{
		Logger:     logger,
		Upgrader:   upgrader,
		JWTSecretA: []byte(WST_SECRET),
		JWTSecretB: []byte(WST_SECRET),
		Domain:     "127.0.0.1",
		Port:       int(port),
		TLS:        false,
		Audience:   WST_AUDIENCE,
	})
	if err != nil {
		listener.Close()
		t.Fatalf("wsproxy.New: %s", err)
	}

	server := &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", port), Handler: handler}
	go func() {
		server.Serve(listener)
	}()

	return wstServer{t, listener, port, handler, server}
}

func (s *wstServer) url() string {
	return fmt.Sprintf("http://127.0.0.1:%d", s.port)
}

func (s *wstServer) close() {
	err := s.server.Close()
	if err != nil {
		s.t.Fatalf("server.Close: %s", err)
	}

	// note that the listener closes with the server
}

// Create a new exposer with fake auth
func makeWstExposer(t *testing.T, serverURL string) Exposer {
	exposer, err := NewWST(
		serverURL,
		WST_AUDIENCE,
		WST_WORKER_GROUP,
		WST_WORKER_ID,
		fakeAuth{},
	)
	if err != nil {
		t.Fatalf("Constructor returned an error: %v", err)
	}
	return exposer
}

// Test exposing a basic HTTP server
func TestBasicWSTExposeHTTP(t *testing.T) {
	wstServer := makeWstServer(t)
	defer wstServer.close()

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello, world @ %s", r.URL.Path)
	}))
	defer ts.Close()

	testURL, _ := url.Parse(ts.URL)
	_, testPortStr, _ := net.SplitHostPort(testURL.Host)
	testPort, _ := strconv.Atoi(testPortStr)
	t.Logf("testPort: %d", testPort)

	exposer := makeWstExposer(t, wstServer.url())
	exposure, err := exposer.ExposeHTTP(uint16(testPort))
	if err != nil {
		t.Fatalf("ExposeHTTP returned an error: %v", err)
	}
	defer exposure.Close()

	gotURL := exposure.GetURL()
	assert.Equal(t, "http", gotURL.Scheme, "Should return URL with correct scheme")
	host, port, _ := net.SplitHostPort(gotURL.Host)
	assert.Equal(t, "127.0.0.1", host, "Should return the host for the websocktunnel server")
	assert.Equal(t, fmt.Sprintf("%d", wstServer.port), port, "Should return the port for the websocktunnel server")

	res, err := http.Get(fmt.Sprintf("%s/abc/def", gotURL))
	if err != nil {
		t.Fatal(err)
	}
	assert.Equal(t, 200, res.StatusCode, "got 200 response via proxy")

	greeting, err := ioutil.ReadAll(res.Body)
	res.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	assert.Equal(t, "Hello, world @ /abc/def", string(greeting), "got greeting via proxy")
}

// Test exposing an HTTP server that serves websockets (requiring full-duplex communication, etc.)
func TestWSTExposeHTTPWebsocket(t *testing.T) {
	wstServer := makeWstServer(t)
	defer wstServer.close()

	ts := websockEchoServer(t)
	defer ts.Close()

	testURL, _ := url.Parse(ts.URL)
	_, testPortStr, _ := net.SplitHostPort(testURL.Host)
	testPort, _ := strconv.Atoi(testPortStr)
	t.Logf("testPort: %d", testPort)

	exposer := makeWstExposer(t, wstServer.url())
	exposure, err := exposer.ExposeHTTP(uint16(testPort))
	if err != nil {
		t.Fatalf("ExposeHTTP returned an error: %v", err)
	}
	defer exposure.Close()

	gotURL := exposure.GetURL()
	assert.Equal(t, "http", gotURL.Scheme, "Should return URL with correct scheme")
	host, port, _ := net.SplitHostPort(gotURL.Host)
	assert.Equal(t, "127.0.0.1", host, "Should return the host for the websocktunnel server")
	assert.Equal(t, fmt.Sprintf("%d", wstServer.port), port, "Should return the port for the websocktunnel server")

	dialer := websocket.Dialer{}
	url := gotURL.String()
	url = strings.Replace(url, "http:", "ws:", 1)
	ws, _, err := dialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("client Dial: %s", err)
	}
	defer ws.Close()

	err = ws.WriteMessage(websocket.BinaryMessage, []byte("ECHO"))
	if err != nil {
		t.Fatalf("client WriteMessage: %s", err)
	}

	messageType, payload, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("client ReadMessage: %s", err)
	}
	assert.Equal(t, messageType, websocket.BinaryMessage, "expected message type")
	assert.Equal(t, payload, []byte("ECHO"), "expected payload")

	_, _, err = ws.ReadMessage()
	if err == nil {
		t.Fatalf("client ReadMessage 2: expected error")
	}
	if !websocket.IsCloseError(err, websocket.CloseAbnormalClosure) {
		t.Fatalf("ReadMessage 2: %s", err)
	}
}

// Test exposing a TCP port
func TestWSTExposeTCPPort(t *testing.T) {
	wstServer := makeWstServer(t)
	defer wstServer.close()

	// set up a TCP echo server on a random port
	tcpListener, tcpListenerPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}
	defer tcpListener.Close()

	// run a tcp echo server on that listener, that will send to
	// connClosed once the connection is closed
	t.Logf("echo server listening on %d", tcpListenerPort)
	connClosed := tcpEchoServer(tcpListener)

	exposer := makeWstExposer(t, wstServer.url())
	exposure, err := exposer.ExposeTCPPort(uint16(tcpListenerPort))
	if err != nil {
		t.Fatalf("ExposeTCPPort returned an error: %v", err)
	}
	defer exposure.Close()

	gotURL := exposure.GetURL()
	assert.Equal(t, "http", gotURL.Scheme, "Should return URL with correct scheme")
	host, port, _ := net.SplitHostPort(gotURL.Host)
	assert.Equal(t, "127.0.0.1", host, "Should return the host for the websocktunnel server")
	assert.Equal(t, fmt.Sprintf("%d", wstServer.port), port, "Should return the port for the websocktunnel server")

	dialer := websocket.Dialer{}
	url := gotURL.String()
	url = strings.Replace(url, "http:", "ws:", 1)
	t.Logf("Dialling wst server at %s", url)
	ws, _, err := dialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("client Dial: %s", err)
	}

	err = ws.WriteMessage(websocket.BinaryMessage, []byte("ECHO"))
	if err != nil {
		t.Fatalf("client WriteMessage: %s", err)
	}

	messageType, payload, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("client ReadMessage: %s", err)
	}
	assert.Equal(t, messageType, websocket.BinaryMessage, "expected message type")
	assert.Equal(t, payload, []byte("ECHO"), "expected payload")

	ws.Close()

	<-connClosed
}
