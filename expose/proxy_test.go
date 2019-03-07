package expose

import (
	"fmt"
	"io"
	"io/ioutil"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
)

// Test that a simple HTTP GET request is proxied
func TestBasicProxying(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello, client")
	}))
	defer server.Close()

	u, _ := url.Parse(server.URL)
	_, portStr, _ := net.SplitHostPort(u.Host)
	port, _ := strconv.Atoi(portStr)

	listener, listenPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}
	defer listener.Close()

	t.Logf("port %d proxying to port %d", listenPort, port)
	ep, err := proxyHTTP(listener, uint16(port))
	if err != nil {
		t.Fatalf("proxyHTTP: %s", err)
	}
	defer ep.Close()

	url := fmt.Sprintf("http://127.0.0.1:%d", listenPort)
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("http.Get: %s", err)
	}
	defer resp.Body.Close()

	assert.Equal(t, 200, resp.StatusCode, "should have 200 return status")
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %s", err)
	}

	assert.Equal(t, "Hello, client", string(body), "body is as expected")
}

// Test that a non-200 response code is proxied
func TestBasicProxyingNon200(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
		fmt.Fprintf(w, "Didn't find that")
	}))
	defer server.Close()

	u, _ := url.Parse(server.URL)
	_, portStr, _ := net.SplitHostPort(u.Host)
	port, _ := strconv.Atoi(portStr)

	listener, listenPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}
	defer listener.Close()

	t.Logf("port %d proxying to port %d", listenPort, port)
	ep, err := proxyHTTP(listener, uint16(port))
	if err != nil {
		t.Fatalf("proxyHTTP: %s", err)
	}
	defer ep.Close()

	url := fmt.Sprintf("http://127.0.0.1:%d", listenPort)
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("http.Get: %s", err)
	}
	defer resp.Body.Close()

	assert.Equal(t, 404, resp.StatusCode, "should have 404 return status")
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %s", err)
	}

	assert.Equal(t, "Didn't find that", string(body), "body is as expected")
}

// test that a streaming response is streamed, and not buffered completely before being
// forwarded
func TestStreamingProxy(t *testing.T) {
	// the HTTP client will feed items into this channel one at a time, expecting the HTTP
	// server to send them back through the body
	bodyParts := make(chan []byte, 10)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)

		flusher := w.(http.Flusher)
		flusher.Flush()

		for part := range bodyParts {
			w.Write(part)
			flusher.Flush()
		}
	}))
	defer server.Close()

	u, _ := url.Parse(server.URL)
	_, portStr, _ := net.SplitHostPort(u.Host)
	port, _ := strconv.Atoi(portStr)

	listener, listenPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}
	defer listener.Close()

	t.Logf("port %d proxying to port %d", listenPort, port)
	ep, err := proxyHTTP(listener, uint16(port))
	if err != nil {
		t.Fatalf("proxyHTTP: %s", err)
	}
	defer ep.Close()

	url := fmt.Sprintf("http://127.0.0.1:%d", listenPort)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatalf("http.NewRequest: %s", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("http.Get: %s", err)
	}
	defer resp.Body.Close()

	parts := [][]byte{[]byte("Hello"), []byte("Cruel"), []byte("World")}
	buf := make([]byte, 1024)
	for _, part := range parts {
		// send the part to the http server
		bodyParts <- part

		// ..and read it back over the HTTP connection
		n, err := resp.Body.Read(buf)
		got := buf[:n]
		if err != nil {
			t.Fatalf("read body: %s", err)
		}
		assert.Equal(t, part, got, "expected body part")
	}
	close(bodyParts)

	_, err = resp.Body.Read(buf)
	assert.Equal(t, io.EOF, err, "expected EOF")
}

// Test that a websocket connection is properly proxied via proxyHTTP
func TestProxyHTTPWebsocket(t *testing.T) {
	// a websocket server that reads a message, echoes it back, and closes
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			Subprotocols: websocket.Subprotocols(r),
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		}

		wsconn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			http.Error(w, fmt.Sprintf("Could not upgrade: %s", err), 500)
			return
		}
		defer wsconn.Close()

		messageType, payload, err := wsconn.ReadMessage()
		if err != nil {
			t.Logf("server ReadMessage: %s", err)
			return
		}

		err = wsconn.WriteMessage(messageType, payload)
		if err != nil {
			t.Logf("server WriteMessage: %s", err)
			return
		}
	}))
	defer server.Close()

	u, _ := url.Parse(server.URL)
	_, portStr, _ := net.SplitHostPort(u.Host)
	port, _ := strconv.Atoi(portStr)

	listener, listenPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}
	defer listener.Close()

	t.Logf("port %d proxying to port %d", listenPort, port)
	ep, err := proxyHTTP(listener, uint16(port))
	if err != nil {
		t.Fatalf("proxyHTTP: %s", err)
	}
	defer ep.Close()

	url := fmt.Sprintf("ws://127.0.0.1:%d", listenPort)
	dialer := websocket.Dialer{}
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

// Test that proxyTCPPort's HTTP server rejects non-websocket
// connections
func TestProxyTCPPortNotWebsocket(t *testing.T) {
	listener, listenPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}

	ep, err := proxyTCPPort(listener, 9999)
	if err != nil {
		t.Fatalf("proxyTCPPort: %s", err)
	}
	defer ep.Close()

	url := fmt.Sprintf("http://127.0.0.1:%d", listenPort)
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("http.Get: %s", err)
	}
	defer resp.Body.Close()

	assert.Equal(t, 404, resp.StatusCode, "GET request should 404")
}

// Test that proxyTCPPort's HTTP server rejects connections
// to other than the root path (/)
func TestProxyTCPPortNotRootPath(t *testing.T) {
	listener, listenPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}

	ep, err := proxyTCPPort(listener, 9999)
	if err != nil {
		t.Fatalf("proxyTCPPort: %s", err)
	}
	defer ep.Close()

	url := fmt.Sprintf("ws://127.0.0.1:%d/random/path", listenPort)
	dialer := websocket.Dialer{}
	_, _, err = dialer.Dial(url, nil)
	assert.Equal(t, fmt.Errorf("websocket: bad handshake"), err, "should get bad handshake")
}

// Test that proxying a TCP port via websocket works correctly, by proxying
// an echo server and testing that a message travels through a websocket
// and back.  Test that the TCP connection is closed when the websocket closes.
func TestProxyTCPPort(t *testing.T) {
	// set up a TCP echo server on a random port
	tcpListener, tcpListenerPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}
	defer tcpListener.Close()

	// run a tcp echo server on that listener, that will send to
	// connClosed once the connection is closed
	connClosed := make(chan bool, 0)
	go func() {
		stream, err := tcpListener.Accept()
		if err != nil {
			t.Logf("err accepting: %s", err)
			return
		}

		io.Copy(stream, stream)
		_ = stream.Close()
		connClosed <- true
	}()

	// set up a WS proxy to that port
	listener, listenPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}

	t.Logf("port %d proxying to port %d", listenPort, tcpListenerPort)
	ep, err := proxyTCPPort(listener, tcpListenerPort)
	if err != nil {
		t.Fatalf("proxyTCPPort: %s", err)
	}
	defer ep.Close()

	// connect to that ws proxy
	url := fmt.Sprintf("ws://127.0.0.1:%d/", listenPort)
	dialer := websocket.Dialer{}
	ws, _, err := dialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("Dial: %s", err)
	}

	err = ws.WriteMessage(websocket.BinaryMessage, []byte("Hello"))
	if err != nil {
		t.Fatalf("WriteMessage: %s", err)
	}

	messageType, payload, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("ReadMessage: %s", err)
	}

	assert.Equal(t, websocket.BinaryMessage, messageType, "got expected message type back")
	assert.Equal(t, []byte("Hello"), payload, "got expected message back")

	// test closing from the websocket side
	ws.Close()

	<-connClosed
}

// Similarly, test that the websocket is closed when the TCP connection closes.
func TestProxyTCPPortTCPClose(t *testing.T) {
	// set up a TCP echo server on a random port
	tcpListener, tcpListenerPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}
	defer tcpListener.Close()

	// on connection, simply write out GOODBYE and close
	go func() {
		stream, err := tcpListener.Accept()
		if err != nil {
			t.Logf("err accepting: %s", err)
			return
		}

		stream.Write([]byte("GOODBYE"))
		stream.Close()
	}()

	// set up a WS proxy to that port
	listener, listenPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}

	ep, err := proxyTCPPort(listener, tcpListenerPort)
	if err != nil {
		t.Fatalf("proxyTCPPort: %s", err)
	}
	defer ep.Close()

	// connect to that ws proxy
	url := fmt.Sprintf("ws://127.0.0.1:%d/", listenPort)
	dialer := websocket.Dialer{}
	ws, _, err := dialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("Dial: %s", err)
	}

	messageType, payload, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("ReadMessage: %s", err)
	}

	assert.Equal(t, websocket.BinaryMessage, messageType, "got expected message type back")
	assert.Equal(t, []byte("GOODBYE"), payload, "got expected message back")

	_, _, err = ws.ReadMessage()
	if err == nil {
		t.Fatalf("ReadMessage 2: expected error")
	}
	if !websocket.IsCloseError(err, websocket.CloseAbnormalClosure) {
		t.Fatalf("ReadMessage 2: %s", err)
	}
}
