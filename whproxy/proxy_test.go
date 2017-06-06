package whproxy

import (
	"bytes"
	"io"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"sync"
	"sync/atomic"

	"github.com/gorilla/websocket"
	log "github.com/sirupsen/logrus"
	"github.com/taskcluster/webhooktunnel/util"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  64 * 1024,
	WriteBufferSize: 64 * 1024,
}

func genLogger(fname string) *log.Logger {
	file, err := os.Create(fname)
	if err != nil {
		panic(err)
	}
	logger := &log.Logger{
		Out:       file,
		Formatter: new(log.TextFormatter),
		Level:     log.DebugLevel,
	}
	return logger
}

// hardcoded jwts for testing
const (
	workerIDjwt       = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0YXNrY2x1c3Rlci1hdXRoIiwic3ViIjoidGMtYXV0aC1jbGllbnRJZCIsIm5iZiI6MTQ5Njc3NTQ5OSwiZXhwIjoxNDk5MzY3NDk5LCJpYXQiOjE0OTY3NzU0OTksImp0aSI6ImlkMTIzNDU2IiwidHlwIjoidGMtcHJveHkubmV0L3JlZ2lzdGVyIiwidGlkIjoid29ya2VySUQifQ.23RIXRXNcFH7rSjiOS_jB_JAYu8060exZxorZTIEFuk"
	workerIDBackupjwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0YXNrY2x1c3Rlci1hdXRoIiwic3ViIjoidGMtYXV0aC1jbGllbnRJZCIsIm5iZiI6MTQ5Njc3NTQ5OSwiZXhwIjoxNDk5MzY3NDk5LCJpYXQiOjE0OTY3NzU0OTksImp0aSI6ImlkMTIzNDU2IiwidHlwIjoidGMtcHJveHkubmV0L3JlZ2lzdGVyIiwidGlkIjoid29ya2VySUQifQ.KDjFGmo_wEfSxn4zMq6BM3D4wXndZduSDzGh1JaqkDs"
	wsWorkerjwt       = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0YXNrY2x1c3Rlci1hdXRoIiwic3ViIjoidGMtYXV0aC1jbGllbnRJZCIsIm5iZiI6MTQ5Njc3NTQ5OSwiZXhwIjoxNDk5MzY3NDk5LCJpYXQiOjE0OTY3NzU0OTksImp0aSI6ImlkMTIzNDU2IiwidHlwIjoidGMtcHJveHkubmV0L3JlZ2lzdGVyIiwidGlkIjoid3NXb3JrZXIifQ.6xuree00XAk4_7857af14RBW7QAarb9161zRZl1euQM"
)

func TestProxyRegister(t *testing.T) {
	//  start proxy server
	proxy_config := Config{
		Upgrader:   upgrader,
		Logger:     genLogger("register-test"),
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}
	proxy := New(proxy_config)
	server := httptest.NewServer(proxy)
	defer server.Close()

	// get url
	wsURL := util.MakeWsURL(server.URL)

	// create address to dial
	workerID := "workerID"
	dialAddr := wsURL + "/register/" + workerID

	// set auth header dial connection to proxy
	header := make(http.Header)
	header.Set("Authorization ", "Bearer "+workerIDjwt)
	conn1, _, err := websocket.DefaultDialer.Dial(dialAddr, header)
	if err != nil {
		t.Fatal(err)
	}

	defer func() {
		_ = conn1.Close()
	}()
	// second connection should succeed
	conn2, _, err := websocket.DefaultDialer.Dial(dialAddr, header)
	if err != nil {
		t.Fatalf("bad status code: connection should be established")
	}
	_ = conn2.Close()
}

// TestProxyRequest
func TestProxyRequest(t *testing.T) {
	proxy_config := Config{
		Upgrader:   upgrader,
		Logger:     genLogger("request-test"),
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}
	proxy := New(proxy_config)
	server := httptest.NewServer(proxy)
	defer server.Close()

	// get url
	wsURL := util.MakeWsURL(server.URL)
	// makeshift client

	header := make(http.Header)
	header.Set("Authorization ", "Bearer "+workerIDjwt)
	clientWs, _, err := websocket.DefaultDialer.Dial(wsURL+"/register/workerID", header)
	if err != nil {
		t.Fatal(err)
	}

	// handler to serve client requests
	clientHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			_, _ = w.Write([]byte("GET successful"))
		case http.MethodPost:
			_, _ = io.Copy(w, r.Body)
		default:
			http.NotFound(w, r)
		}
	})

	// serve client endpoint
	clientServer := &http.Server{Handler: clientHandler}
	go func() {
		_ = clientServer.Serve(wsmux.Client(clientWs, wsmux.Config{}))
	}()
	defer func() {
		_ = clientServer.Close()
	}()

	// make requests
	viewer := &http.Client{}
	servURL := server.URL

	// GET request
	resp, err := viewer.Get(servURL + "/workerID/")
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Log(resp)
		t.Fatalf("bad status code on get request")
	}
	reply, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(reply, []byte("GET successful")) {
		t.Fatalf("GET failed. Bad message")
	}

	// POST request
	resp, err = viewer.Post(servURL+"/workerID/", "application/text", bytes.NewBuffer([]byte("message")))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("bad status code on post request")
	}
	reply, err = ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(reply, []byte("message")) {
		t.Fatalf("POST failed. Bad message")
	}

	// GET request to invalid id
	resp, err = viewer.Get(servURL + "/notWorkerID/")
	if resp.StatusCode != 404 {
		t.Fatalf("request should fail with 404")
	}
}

func TestProxyWebsocket(t *testing.T) {
	proxy_config := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}
	proxy := New(proxy_config)
	server := httptest.NewServer(proxy)
	wsURL := util.MakeWsURL(server.URL)
	defer server.Close()

	clientHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !websocket.IsWebSocketUpgrade(r) {
			http.NotFound(w, r)
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatal(err)
		}

		mt, buf, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}

		err = conn.WriteMessage(mt, buf)
		if err != nil {
			t.Fatal(err)
		}
	})

	// register worker and serve http
	header := make(http.Header)
	header.Set("Authorization", "Bearer "+wsWorkerjwt)
	clientWs, _, err := websocket.DefaultDialer.Dial(wsURL+"/register/wsWorker/", header)
	if err != nil {
		t.Fatal(err)
	}

	clientServer := &http.Server{Handler: clientHandler}
	go func() {
		_ = clientServer.Serve(wsmux.Client(clientWs, wsmux.Config{}))
	}()
	defer func() {
		_ = clientServer.Close()
	}()

	// create websocket connection
	conn, _, err := websocket.DefaultDialer.Dial(wsURL+"/wsWorker/", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = conn.Close()
	}()

	// Generate 1M message
	message := make([]byte, 0)
	for i := 0; i < 1024*1024; i++ {
		message = append(message, byte(i%127))
	}

	err = conn.WriteMessage(websocket.BinaryMessage, message)
	if err != nil {
		t.Fatal(err)
	}

	_, buf, err := conn.ReadMessage()
	if !bytes.Equal(buf, message) {
		t.Fatalf("websocket test failed. Bad message")
	}
}

// ensure control messages are proxied
func TestWebsocketProxyControl(t *testing.T) {
	logger := genLogger("ws-control-test")
	proxy_config := Config{
		Upgrader:   upgrader,
		Logger:     genLogger("request-test"),
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}
	proxy := New(proxy_config)
	//serve proxy
	server := httptest.NewServer(proxy)
	wsURL := util.MakeWsURL(server.URL)
	defer server.Close()

	// mechanism to know test has completed
	var wg sync.WaitGroup
	wg.Add(4)
	done := func() chan bool {
		tdone := make(chan bool, 1)
		go func() {
			wg.Wait()
			close(tdone)
		}()
		return tdone
	}

	clientHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !websocket.IsWebSocketUpgrade(r) {
			http.NotFound(w, r)
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatal(err)
		}

		// set ping handler. Decrement wg to ensure ping frame was received
		conn.SetPingHandler(func(appData string) error {
			defer wg.Done()
			return conn.WriteControl(websocket.PongMessage, []byte(appData), time.Now().Add(500*time.Millisecond))
		})

		// set pong handler. Decrement wg when called.
		conn.SetPongHandler(func(appData string) error {
			defer wg.Done()
			logger.Printf("received pong: %s", appData)
			if appData != "ping" {
				t.Fatal("bad pong")
			}
			return nil
		})

		err = conn.WriteControl(websocket.PingMessage, []byte("ping"), time.Now().Add(1*time.Second))
		// Read message to make sure ping was received
		for {
			_, _, err = conn.NextReader()
			if err != nil {
				break
			}
		}
	})

	// register worker and serve http
	header := make(http.Header)
	header.Set("Authorization", "Bearer "+wsWorkerjwt)
	clientWs, _, err := websocket.DefaultDialer.Dial(wsURL+"/register/wsWorker/", header)
	if err != nil {
		t.Fatal(err)
	}

	clientServer := &http.Server{Handler: clientHandler}
	go func() {
		_ = clientServer.Serve(wsmux.Client(clientWs, wsmux.Config{}))
	}()
	defer func() {
		_ = clientServer.Close()
	}()

	// create websocket connection
	conn, _, err := websocket.DefaultDialer.Dial(wsURL+"/wsWorker/", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = conn.Close()
	}()

	// Set Pong Handler. Decrement wg when pong handler fires to ensure that
	// pong is called
	conn.SetPongHandler(func(appData string) error {
		defer wg.Done()
		logger.Printf("received pong: %s", appData)
		if appData != "ping" {
			t.Fatal("bad pong")
		}
		return nil
	})

	conn.SetPingHandler(func(appData string) error {
		defer wg.Done()
		return conn.WriteControl(websocket.PongMessage, []byte(appData), time.Now().Add(500*time.Millisecond))
	})

	// set timer for timing out test
	timer := time.NewTimer(3 * time.Second)

	// start reading messages to ensure pong is received
	go func() {
		for {
			_, _, err = conn.NextReader()
			if err != nil {
				break
			}
		}
	}()

	err = conn.WriteControl(websocket.PingMessage, []byte("ping"), time.Now().Add(1*time.Second))
	if err != nil {
		t.Fatal(err)
	}

	select {
	case <-timer.C:
		t.Fatalf("test failed: timeout")
	case <-done():
	}

}

// Ensure websocket close is proxied
func TestWebSocketClosure(t *testing.T) {
	logger := genLogger("ws-closure-test")
	proxy_config := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}
	proxy := New(proxy_config)
	//serve proxy
	server := httptest.NewServer(proxy)
	wsURL := util.MakeWsURL(server.URL)
	defer server.Close()

	// mechanism to know test has completed
	done := make(chan bool, 1)

	clientHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !websocket.IsWebSocketUpgrade(r) {
			http.NotFound(w, r)
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatal(err)
		}

		for {
			_, _, err = conn.NextReader()
			if err != nil && websocket.IsCloseError(err, websocket.CloseAbnormalClosure) {
				logger.Printf("closed")
				close(done)
				break
			}
			if err != nil {
				t.Fatal(err)
			}
		}

	})

	// register worker and serve http
	header := make(http.Header)
	header.Set("Authorization", "Bearer "+wsWorkerjwt)
	clientWs, _, err := websocket.DefaultDialer.Dial(wsURL+"/register/wsWorker/", header)
	if err != nil {
		t.Fatal(err)
	}

	clientServer := &http.Server{Handler: clientHandler}
	go func() {
		_ = clientServer.Serve(wsmux.Client(clientWs, wsmux.Config{}))
	}()
	defer func() {
		_ = clientServer.Close()
	}()

	// create websocket connection
	conn, _, err := websocket.DefaultDialer.Dial(wsURL+"/wsWorker/", header)
	if err != nil {
		t.Fatal(err)
	}

	// set timer for timing out test
	timer := time.NewTimer(4 * time.Second)

	// Close connection
	// will cause abnormal closure as Close will cause the underlying connection
	// to close without sending any close frame
	err = conn.Close()
	if err != nil {
		t.Fatal(err)
	}

	select {
	case <-timer.C:
		t.Fatalf("test failed: timeout")
	case <-done:
	}

}

// Ensures that session is removed once websocket connection is closed
func TestProxySessionRemoved(t *testing.T) {
	done := make(chan bool, 1)
	proxy_config := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}
	proxy := New(proxy_config)
	proxy.SetSessionRemoveHandler(func(id string) {
		close(done)
	})

	server := httptest.NewServer(proxy)

	defer server.Close()

	wsURL := util.MakeWsURL(server.URL)
	header := make(http.Header)
	header.Set("Authorization", "Bearer "+wsWorkerjwt)
	conn, _, err := websocket.DefaultDialer.Dial(wsURL+"/register/wsWorker", header)
	if err != nil {
		t.Fatal(err)
	}

	timeout := time.NewTimer(4 * time.Second)
	err = conn.Close()
	if err != nil {
		t.Fatal(err)
	}

	select {
	case <-done:
	case <-timeout.C:
		t.Fatalf("test timed out")
	}
}

// Simple test to ensure that proxy authenticates valid jwt and rejects other jwt
func TestProxyAuth(t *testing.T) {
	proxy_config := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}
	proxy := New(proxy_config)
	server := httptest.NewServer(proxy)
	defer server.Close()

	wsURL := util.MakeWsURL(server.URL)
	header := make(http.Header)
	header.Set("Authorization", "Bearer "+wsWorkerjwt)

	conn, res, err := websocket.DefaultDialer.Dial(wsURL+"/register/workerID", header)
	if res == nil || res.StatusCode != 400 {
		_ = conn.Close()
		t.Fatalf("connection should fail")
	}

	conn, res, err = websocket.DefaultDialer.Dial(wsURL+"/register/wsWorker", header)
	if err != nil {
		t.Fatal(err)
	}
	_ = conn.Close()
}

// Check that only 1 connection is active even if multiple connections are made
func TestProxyMultiAuth(t *testing.T) {
	proxy_config := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}
	proxy := New(proxy_config)
	server := httptest.NewServer(proxy)
	defer server.Close()

	streamCount := 4
	wsURL := util.MakeWsURL(server.URL)
	activeStreams := int32(streamCount)
	logger := genLogger("multi-auth-test")

	getConn := func() *websocket.Conn {
		header := make(http.Header)
		header.Set("Authorization", "Bearer "+wsWorkerjwt)
		conn, resp, err := websocket.DefaultDialer.Dial(wsURL+"/register/wsWorker", header)
		if err != nil {
			logger.Printf("error connecting to proxy")
			t.Fatal(err)
		}
		logger.Printf("connected to proxy %v", resp)
		return conn
	}

	testConn := func() {
		conn := getConn()
		session := wsmux.Client(conn, wsmux.Config{})
		session.SetCloseCallback(func() {
			logger.Printf("session closed")
			atomic.AddInt32(&activeStreams, -1)
		})
	}

	for i := 0; i < streamCount; i++ {
		go testConn()
	}

	timeout := time.After(5 * time.Second)
	done := func() chan bool {
		d := make(chan bool, 1)
		go func() {
			// add 2 when connecting and subtract 1 when disconnecting
			// total = 2*x - (x-1)
			// total = x + 1
			for atomic.LoadInt32(&activeStreams) != 1 {
			}
			close(d)
		}()
		return d
	}

	select {
	case <-timeout:
		t.Fatalf("test timed out")
	case <-done():
		if atomic.LoadInt32(&activeStreams) != 1 {
			t.Fatal("only 1 stream should be active")
		}
	}
}

// Ensure authentication with both secrets works
func TestProxySecrets(t *testing.T) {
	proxy_config := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}
	proxy := New(proxy_config)

	server := httptest.NewServer(proxy)
	defer server.Close()
	wsURL := util.MakeWsURL(server.URL)

	// try connecting wsWorker with secret A
	header := make(http.Header)
	header.Set("Authorization", "Bearer "+wsWorkerjwt)

	_, _, err := websocket.DefaultDialer.Dial(wsURL+"/register/wsWorker", header)
	if err != nil {
		t.Fatal(err)
	}

	header.Set("Authorization", "Bearer "+workerIDBackupjwt)

	_, _, err = websocket.DefaultDialer.Dial(wsURL+"/register/workerID", header)
	if err != nil {
		t.Fatal(err)
	}
}
