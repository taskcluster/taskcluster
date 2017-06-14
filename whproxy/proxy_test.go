package whproxy

import (
	"bytes"
	"io"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"testing"
	"time"

	"sync"

	"github.com/dgrijalva/jwt-go"
	"github.com/gorilla/websocket"
	log "github.com/sirupsen/logrus"
	"github.com/taskcluster/webhooktunnel/util"
	"github.com/taskcluster/webhooktunnel/whclient"
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

var (
	workerIDjwt       = tokenGenerator("workerID", []byte("test-secret"))
	workerIDBackupjwt = tokenGenerator("workerID", []byte("another-secret"))
	wsWorkerjwt       = tokenGenerator("wsWorker", []byte("test-secret"))
)

func tokenGenerator(id string, secret []byte) string {
	now := time.Now()
	expires := now.Add(30 * 24 * time.Hour)

	token := jwt.New(jwt.SigningMethodHS256)

	token.Claims.(jwt.MapClaims)["iat"] = now.Unix()
	token.Claims.(jwt.MapClaims)["nbf"] = now.Unix() - 300 // 5 minutes
	token.Claims.(jwt.MapClaims)["iss"] = "taskcluster-auth"
	token.Claims.(jwt.MapClaims)["exp"] = expires.Unix()
	token.Claims.(jwt.MapClaims)["tid"] = id

	tokString, _ := token.SignedString(secret)
	return tokString
}

func TestProxyRegister(t *testing.T) {
	//  start proxy server
	proxyConfig := Config{
		Upgrader:   upgrader,
		Logger:     genLogger("register-test"),
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

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
	proxyConfig := Config{
		Upgrader:   upgrader,
		Logger:     genLogger("request-test"),
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

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
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

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
	proxyConfig := Config{
		Upgrader:   upgrader,
		Logger:     genLogger("request-test"),
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}
	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}
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
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

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
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}

	proxy, err := newProxy(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	proxy.setSessionRemoveHandler(func(id string) {
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

	err = conn.Close()
	if err != nil {
		t.Fatal(err)
	}

	select {
	case <-done:
	case <-time.After(4 * time.Second):
		t.Fatalf("test timed out")
	}
}

// Simple test to ensure that proxy authenticates valid jwt and rejects other jwt
func TestProxyAuth(t *testing.T) {
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

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
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Logger:     genLogger("multi-auth-proxy-test"),
	}
	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(proxy)
	defer server.Close()

	var wg sync.WaitGroup
	wg.Add(3)
	wsURL := util.MakeWsURL(server.URL)
	logger := genLogger("multi-auth-test")

	getConn := func() *websocket.Conn {
		header := make(http.Header)
		header.Set("Authorization", "Bearer "+wsWorkerjwt)
		conn, _, err := websocket.DefaultDialer.Dial(wsURL+"/register/wsWorker", header)
		if err != nil {
			logger.Printf("error connecting to proxy")
			t.Fatal(err)
		}
		return conn
	}

	testConn := func() {
		conn := getConn()
		session := wsmux.Client(conn, wsmux.Config{})
		session.SetCloseCallback(func() {
			logger.Printf("session closed")
			wg.Done()
		})
	}

	for i := 0; i < 4; i++ {
		go testConn()
	}

	timeout := time.After(5 * time.Second)
	done := func() chan bool {
		d := make(chan bool, 1)
		go func() {
			wg.Wait()
			close(d)
		}()
		return d
	}

	select {
	case <-timeout:
		t.Fatalf("test timed out")
	case <-done():
	}
}

// Ensure authentication with both secrets works
func TestProxySecrets(t *testing.T) {
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(proxy)
	defer server.Close()
	wsURL := util.MakeWsURL(server.URL)

	// try connecting wsWorker with secret A
	header := make(http.Header)
	jwt := tokenGenerator("test-worker", []byte("test-secret"))
	header.Set("Authorization", "Bearer "+jwt)

	_, _, err = websocket.DefaultDialer.Dial(wsURL+"/register/test-worker", header)
	if err != nil {
		t.Fatal(err)
	}

	jwt = tokenGenerator("test-worker-2", []byte("another-secret"))
	header.Set("Authorization", "Bearer "+jwt)

	_, _, err = websocket.DefaultDialer.Dial(wsURL+"/register/test-worker-2", header)
	if err != nil {
		t.Fatal(err)
	}
}

// Ensure that readind over a slow stream works
func TestResponseStream(t *testing.T) {
	logger := genLogger("response-stream-test")
	proxyLogger := genLogger("response-stream-proxy-test")
	clientLogger := genLogger("response-stream-client-test")

	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Logger:     proxyLogger,
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(proxy)
	defer server.Close()

	wsURL := util.MakeWsURL(server.URL)

	// create client
	client, err := whclient.New(whclient.Config{
		ID:        "test-worker",
		ProxyAddr: wsURL,
		Authorize: func(id string) (string, error) {
			return tokenGenerator(id, []byte("test-secret")), nil
		},
		Logger: clientLogger,
	})
	if err != nil {
		t.Fatal(err)
	}

	done := make(chan struct{})
	clientFn := func(writer http.ResponseWriter, r *http.Request) {
		_, err := writer.Write([]byte("Hello"))
		if err != nil {
			logger.Print(err)
			t.Fatal(err)
		}
		flusher, ok := writer.(http.Flusher)
		if !ok {
			t.Fatal(err)
		}
		flusher.Flush()
		<-done
		_, err = writer.Write([]byte("world"))
	}

	srv := &http.Server{Handler: http.HandlerFunc(clientFn)}
	go func() {
		_ = srv.Serve(client)
	}()
	defer func() {
		_ = srv.Close()
	}()

	req, err := http.NewRequest(http.MethodGet, server.URL+"/test-worker/", nil)
	if err != nil {
		t.Fatal(err)
	}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = res.Body.Close()
	}()

	d := []byte{0}
	buf := make([]byte, 0)
	for string(buf) != "Hello" {
		n, err := res.Body.Read(d)
		if n == 1 {
			buf = append(buf, d...)
		}
		if err != nil {
			t.Fatal(err)
		}
	}
	close(done)
	buf, err = ioutil.ReadAll(res.Body)
	if string(buf) != "world" {
		t.Fatal("bad message")
	}
	logger.Printf(string(buf))
}

func TestWebSocketStreamClient(t *testing.T) {
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(proxy)
	defer server.Close()
	wsURL := util.MakeWsURL(server.URL)

	client, err := whclient.New(whclient.Config{
		ID:        "test-worker",
		ProxyAddr: wsURL,
		Authorize: func(id string) (string, error) {
			return tokenGenerator(id, []byte("test-secret")), nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	done := make(chan struct{})
	clientFn := func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatal(err)
		}
		err = conn.WriteMessage(websocket.BinaryMessage, []byte("Hello"))
		<-done
		err = conn.WriteMessage(websocket.BinaryMessage, []byte("World"))
		_ = conn.Close()
	}

	srv := &http.Server{Handler: http.HandlerFunc(clientFn)}
	go func() {
		_ = srv.Serve(client)
	}()
	defer func() {
		_ = srv.Close()
	}()

	// make websocket request
	conn, _, err := websocket.DefaultDialer.Dial(wsURL+"/test-worker/", nil)
	if err != nil {
		t.Fatal(err)
	}
	_, buf, err := conn.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	if string(buf) != "Hello" {
		t.Fatal("bad message")
	}
	close(done)
	_, buf, err = conn.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	if string(buf) != "World" {
		t.Fatal("bad message")
	}
}

// only run if dns can resolver *.tcproxy.dev to 127.0.0.1
func getPort(servURL string) string {
	re := regexp.MustCompile(":(\\d+)$")
	return re.FindStringSubmatch(servURL)[1]
}

func TestDomainResolve(t *testing.T) {
	if os.Getenv("TEST_DNS_SET") != "yes" {
		t.Skip("dns not set")
	}
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "tcproxy.dev",
		Logger:     genLogger("domain-resolve-proxy-test"),
	}
	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	// attempt hosting on port 80
	server := httptest.NewServer(proxy)
	defer server.Close()

	header := make(http.Header)
	header.Set("Authorization", "Bearer "+tokenGenerator("workerID", []byte("test-secret")))

	// make connection
	clientConfig := whclient.Config{
		ID:        "workerID",
		ProxyAddr: "ws://tcproxy.dev:" + getPort(server.URL),
		Authorize: func(id string) (string, error) {
			return tokenGenerator(id, []byte("test-secret")), nil
		},
		Logger: genLogger("domain-resolve-client-test"),
	}

	client, err := whclient.New(clientConfig)
	if err != nil {
		t.Fatal(err)
	}

	// test if can resolve worker using domain
	var wg sync.WaitGroup
	clientHandler := func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/some/path" {
			http.NotFound(w, r)
			return
		}
		flusher, _ := w.(http.Flusher)
		w.Write([]byte("Hello"))
		flusher.Flush()
		wg.Wait()
		w.Write([]byte("World"))
	}

	srv := &http.Server{Handler: http.HandlerFunc(clientHandler)}
	defer func() {
		_ = srv.Close()
	}()
	go func() {
		_ = srv.Serve(client)
	}()

	req, err := http.NewRequest(http.MethodGet, "http://workerID.tcproxy.dev:"+getPort(server.URL)+"/some/path", nil)
	if err != nil {
		t.Fatal(err)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil || res.StatusCode == 404 {
		t.Fatal(err)
	}

	// read streaming request
	d := []byte{0}
	data := []byte{}
	for {
		n, err := res.Body.Read(d)
		if n > 0 {
			data = append(data, d...)
		}
		if string(data) == "Hello" {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
	}

	data, err = ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "World" {
		t.Fatal("bad message")
	}
}
