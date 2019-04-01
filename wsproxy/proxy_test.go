package wsproxy

import (
	"bytes"
	"fmt"

	// "crypto/tls"
	"io"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"sync"
	"testing"
	"time"

	jwt "github.com/dgrijalva/jwt-go"
	"github.com/gorilla/websocket"
	log "github.com/sirupsen/logrus"
	"github.com/taskcluster/websocktunnel/client"
	"github.com/taskcluster/websocktunnel/util"
	"github.com/taskcluster/websocktunnel/wsmux"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  64 * 1024,
	WriteBufferSize: 64 * 1024,
}

func genLogger() *log.Logger {
	logger := &log.Logger{
		Out:       os.Stdout,
		Formatter: new(log.TextFormatter),
		Level:     log.DebugLevel,
	}
	return logger
}

var (
	workeridjwt = tokenGenerator("workerid", []byte("test-secret"))
	wsworkerjwt = tokenGenerator("wsworker", []byte("test-secret"))
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
		Logger:     genLogger(),
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "localhost",
		Port:       80,
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
	workerid := "workerid"
	// set auth header dial connection to proxy
	header := make(http.Header)
	header.Set("Authorization ", "Bearer "+workeridjwt)
	header.Set("x-websocktunnel-id", workerid)
	conn1, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatal(err)
	}

	defer func() {
		_ = conn1.Close()
	}()
	// second connection should succeed
	conn2, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("bad status code: connection should be established")
	}
	_ = conn2.Close()
}

func TestProxyRegisterInvalidClientId(t *testing.T) {
	//  start proxy server
	proxyConfig := Config{
		Upgrader:   upgrader,
		Logger:     genLogger(),
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "localhost",
		Port:       80,
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(proxy)
	defer server.Close()

	// get url
	wsURL := util.MakeWsURL(server.URL)

	// invalid worker ID (/ is not allowed)
	workerid := "worker/id"
	// set auth header dial connection to proxy
	header := make(http.Header)
	header.Set("Authorization ", "Bearer "+workeridjwt)
	header.Set("x-websocktunnel-id", workerid)
	_, _, err = websocket.DefaultDialer.Dial(wsURL, header)
	if err == nil {
		t.Fatalf("Did not get expected error")
	}
	// all we get from gorilla/websocket is "bad handshake", unfortunately
}

// TestProxyRequest
func TestProxyRequest(t *testing.T) {
	proxyConfig := Config{
		Upgrader:   upgrader,
		Logger:     genLogger(),
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "localhost",
		Port:       80,
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
	header.Set("Authorization ", "Bearer "+workeridjwt)
	header.Set("x-websocktunnel-id", "workerid")
	clientWs, _, err := websocket.DefaultDialer.Dial(wsURL, header)
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
	fmt.Printf("%#v", servURL)
	resp, err := viewer.Get(servURL + "/workerid/")
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
	resp, err = viewer.Post(servURL+"/workerid/", "application/text", bytes.NewBuffer([]byte("message")))
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
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 504 {
		t.Fatalf("request should fail with 504")
	}
}

func TestProxyURIRewrite(t *testing.T) {
	proxyConfig := Config{
		Upgrader:   upgrader,
		Logger:     genLogger(),
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "localhost",
		Port:       80,
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
	header.Set("Authorization ", "Bearer "+workeridjwt)
	header.Set("x-websocktunnel-id", "workerid")
	clientWs, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatal(err)
	}

	// handler to serve client requests
	reqURI := "/path?foo=bar&abc=def"
	clientHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != reqURI {
			t.Fatal("bad uri propogated")
		}
		_, _ = w.Write([]byte("Hello World\n"))
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
	servURL := server.URL + "/workerid" + reqURI

	// GET request
	resp, err := viewer.Get(servURL)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Fatal("bad status code")
	}
}

func TestProxyWebsocket(t *testing.T) {
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "localhost",
		Port:       80,
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(proxy)
	wsURL := util.MakeWsURL(server.URL)
	defer server.Close()

	clientHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/abc" {
			t.Fatalf("Got incorrect path %s", r.URL.Path)
		}

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
	header.Set("Authorization", "Bearer "+wsworkerjwt)
	header.Set("x-websocktunnel-id", "wsworker")
	clientWs, _, err := websocket.DefaultDialer.Dial(wsURL, header)
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
	conn, _, err := websocket.DefaultDialer.Dial(wsURL+"/wsworker/abc", nil)
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
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(buf, message) {
		t.Fatalf("websocket test failed. Bad message")
	}
}

// ensure control messages are proxied
func TestWebsocketProxyControl(t *testing.T) {
	logger := genLogger()
	proxyConfig := Config{
		Upgrader:   upgrader,
		Logger:     genLogger(),
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "localhost",
		Port:       80,
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
		if err != nil {
			t.Fatal(err)
		}
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
	header.Set("Authorization", "Bearer "+wsworkerjwt)
	header.Set("x-websocktunnel-id", "wsworker")
	clientWs, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatal(err)
	}

	clientServer := &http.Server{Handler: clientHandler}
	errChan := make(chan error, 1)
	go func() {
		err := clientServer.Serve(wsmux.Client(clientWs, wsmux.Config{}))
		if err != nil {
			errChan <- err
		}
	}()
	defer func() {
		_ = clientServer.Close()
	}()

	// create websocket connection
	conn, _, err := websocket.DefaultDialer.Dial(wsURL+"/wsworker/", nil)
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
	case err = <-errChan:
		t.Fatal(err)
	case <-done():
	}

}

// Ensure websocket close is proxied
func TestWebSocketClosure(t *testing.T) {
	logger := genLogger()
	proxyLogger := genLogger()
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Logger:     proxyLogger,
		Domain:     "localhost",
		Port:       80,
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
		logger.Printf("received request")
		if !websocket.IsWebSocketUpgrade(r) {
			logger.Printf("not websocket request")
			http.NotFound(w, r)
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatal(err)
		}
		logger.Printf("established proxy ws connection")

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
	header.Set("Authorization", "Bearer "+wsworkerjwt)
	header.Set("x-websocktunnel-id", "wsworker")
	clientWs, res, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatal(err)
	}
	logger.Print(res)

	clientServer := &http.Server{Handler: clientHandler}
	errChan := make(chan error, 1)
	go func() {
		err := clientServer.Serve(wsmux.Client(clientWs, wsmux.Config{Log: logger}))
		if err != nil {
			errChan <- err
		}
	}()
	defer func() {
		_ = clientServer.Close()
	}()

	// logger.Printf("connecting to proxy")
	// create websocket connection
	// add the previous header to make sure registration only occurs when path is "/"
	conn, res, err := websocket.DefaultDialer.Dial(wsURL+"/wsworker/", header)
	if err != nil {
		t.Fatal(err)
	}
	logger.Printf("created ws connection: %v", res)

	// set timer for timing out test
	timer := time.NewTimer(4 * time.Second)

	// Close connection
	// will cause abnormal closure as Close will cause the underlying connection
	// to close without sending any close frame
	err = conn.Close()
	if err != nil {
		t.Fatal(err)
	}
	logger.Printf("test closed ws")

	select {
	case <-timer.C:
		t.Fatalf("test failed: timeout")
	case err = <-errChan:
		t.Fatal(err)
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
		Domain:     "localhost",
		Port:       80,
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
	header.Set("Authorization", "Bearer "+wsworkerjwt)
	header.Set("x-websocktunnel-id", "wsworker")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
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
		Domain:     "localhost",
		Port:       80,
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(proxy)
	defer server.Close()

	wsURL := util.MakeWsURL(server.URL)
	header := make(http.Header)
	header.Set("Authorization", "Bearer "+wsworkerjwt)
	header.Set("x-websocktunnel-id", "workerid")

	conn, res, _ := websocket.DefaultDialer.Dial(wsURL, header)
	if res == nil || res.StatusCode != 401 {
		_ = conn.Close()
		t.Fatalf("connection should fail")
	}

	header.Set("x-websocktunnel-id", "wsworker")
	conn, _, err = websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatal(err)
	}
	_ = conn.Close()
}

func TestConcurrentConnections(t *testing.T) {
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "localhost",
		Port:       80,
	}
	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(proxy)
	defer server.Close()
	wsURL := util.MakeWsURL(server.URL)

	clientLogger := genLogger()
	client, err := client.New(testConfigurer("test-worker", wsURL, client.RetryConfig{}, clientLogger))
	if err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	clHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(1 * time.Second)
		wg.Done()
		_, _ = w.Write([]byte("Hello"))
	})
	clServer := &http.Server{Handler: clHandler}
	go func() {
		_ = clServer.Serve(client)
	}()

	done := make(chan struct{}, 1)
	errCh := make(chan error, 1)
	wg.Add(200)
	for i := 0; i < 200; i++ {
		go func() {
			req, err := http.NewRequest(http.MethodGet, server.URL+"/test-worker/", nil)
			if err != nil {
				errCh <- err
				return
			}
			_, err = http.DefaultClient.Do(req)
			if err != nil {
				errCh <- err
				return
			}
		}()
	}
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-time.After(20 * time.Second):
		t.Fatal("test timed out")
	case err := <-errCh:
		t.Fatal(err)
	case <-done:
	}
}

// Ensure authentication with both secrets works
func TestProxySecrets(t *testing.T) {
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "localhost",
		Port:       80,
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(proxy)
	defer server.Close()
	wsURL := util.MakeWsURL(server.URL)

	// try connecting wsworker with secret A
	header := make(http.Header)
	jwt := tokenGenerator("test-worker", []byte("test-secret"))
	header.Set("Authorization", "Bearer "+jwt)
	header.Set("x-websocktunnel-id", "test-worker")

	_, _, err = websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatal(err)
	}

	jwt = tokenGenerator("test-worker-2", []byte("another-secret"))
	header.Set("Authorization", "Bearer "+jwt)
	header.Set("x-websocktunnel-id", "test-worker-2")

	_, _, err = websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatal(err)
	}
}

// function for generating configurer objects
func testConfigurer(id, addr string, retryConfig client.RetryConfig, logger *log.Logger) client.Configurer {
	now := time.Now()
	expires := now.Add(30 * 24 * time.Hour)

	token := jwt.New(jwt.SigningMethodHS256)

	token.Claims.(jwt.MapClaims)["nbf"] = now.Unix() - 300 // 5 minutes
	token.Claims.(jwt.MapClaims)["iss"] = "taskcluster-auth"
	token.Claims.(jwt.MapClaims)["exp"] = expires.Unix()
	token.Claims.(jwt.MapClaims)["tid"] = id

	tokString, _ := token.SignedString([]byte("test-secret"))

	return func() (client.Config, error) {
		conf := client.Config{
			ID:         id,
			TunnelAddr: addr,
			Token:      tokString,
			Logger:     logger,
			Retry:      retryConfig,
		}
		return conf, nil
	}
}

// Ensure that readind over a slow stream works
func TestResponseStream(t *testing.T) {
	logger := genLogger()
	proxyLogger := genLogger()
	clientLogger := genLogger()

	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Logger:     proxyLogger,
		Domain:     "localhost",
		Port:       80,
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(proxy)
	defer server.Close()

	wsURL := util.MakeWsURL(server.URL)

	// create client
	client, err := client.New(testConfigurer("test-worker", wsURL, client.RetryConfig{}, clientLogger))
	if err != nil {
		t.Fatal(err)
	}

	done := make(chan struct{})
	clientFn := func(writer http.ResponseWriter, r *http.Request) {
		_, err := writer.Write([]byte("Hello"))
		if err != nil {
			panic(err)
		}
		flusher, ok := writer.(http.Flusher)
		if !ok {
			panic(err)
		}
		flusher.Flush()
		<-done
		_, err = writer.Write([]byte("world"))
		if err != nil {
			panic(err)
		}
	}

	srv := &http.Server{Handler: http.HandlerFunc(clientFn)}
	go func() {
		_ = srv.Serve(client)
	}()
	defer func() {
		logger.Printf("closing client")
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
	if err != nil {
		t.Fatal(err)
	}
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
		Domain:     "localhost",
		Port:       80,
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(proxy)
	defer server.Close()
	wsURL := util.MakeWsURL(server.URL)

	client, err := client.New(testConfigurer("test-worker", wsURL, client.RetryConfig{}, genLogger()))
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
		if err != nil {
			t.Fatal(err)
		}
		<-done
		err = conn.WriteMessage(websocket.BinaryMessage, []byte("World"))
		if err != nil {
			t.Fatal(err)
		}
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

// only run these tests if dns can resolver *.tcproxy.dev to 127.0.0.1
func getPort(servURL string) string {
	re := regexp.MustCompile(`:(\d+)$`)
	return re.FindStringSubmatch(servURL)[1]
}

// Test a GET request via the tunnel, using a client
func TestGetRequestWithClient(t *testing.T) {
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "localhost",
		Port:       80,
		Logger:     genLogger(),
	}
	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	// attempt hosting on port 80
	server := httptest.NewServer(proxy)
	defer server.Close()

	// make connection
	client, err := client.New(testConfigurer("myclient", "ws://localhost:"+getPort(server.URL), client.RetryConfig{},
		genLogger()))

	if err != nil {
		t.Fatal(err)
	}

	// make a GET request via the tunnel
	var wg sync.WaitGroup
	clientHandler := func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/some/path" {
			http.NotFound(w, r)
			return
		}
		flusher, _ := w.(http.Flusher)
		_, err := w.Write([]byte("Hello"))
		if err != nil {
			t.Fatal(err)
		}
		flusher.Flush()
		wg.Wait()
		_, err = w.Write([]byte("World"))
		if err != nil {
			t.Fatal(err)
		}
	}

	srv := &http.Server{Handler: http.HandlerFunc(clientHandler)}
	defer func() {
		_ = srv.Close()
	}()
	go func() {
		_ = srv.Serve(client)
	}()

	req, err := http.NewRequest(http.MethodGet, "http://localhost:"+getPort(server.URL)+"/myclient/some/path", nil)
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

// Test that client.New creates a client that has client.URL set to the client
// URL (which includes the client ID)
func TestClientURL(t *testing.T) {
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "localhost",
		Port:       80,
		Logger:     genLogger(),
	}
	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	// attempt hosting on port 80
	server := httptest.NewServer(proxy)
	defer server.Close()

	// make connection
	client, err := client.New(testConfigurer("myclient", "ws://localhost:"+getPort(server.URL), client.RetryConfig{},
		genLogger()))

	if err != nil {
		t.Fatal(err)
	}
	if client.URL() != "http://localhost/myclient" {
		t.Fatalf("bad url; got %s", client.URL())
	}
	_ = client.Close()
}

// Test a WebSocket connection via the tunnel
func TestProxyWebSocketPath(t *testing.T) {
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "localhost",
		Port:       80,
		Logger:     genLogger(),
	}
	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}
	// attempt hosting on port 80
	server := httptest.NewServer(proxy)
	defer server.Close()

	clientLogger := genLogger()
	wsURL := util.MakeWsURL(server.URL)
	client, err := client.New(testConfigurer("myclient", wsURL, client.RetryConfig{}, clientLogger))
	if err != nil {
		t.Fatal(err)
	}

	reqURI := "/hookid/path?foo=bar&abc=def"
	uri := "ws://localhost:" + getPort(server.URL) + "/myclient" + reqURI
	clientHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !websocket.IsWebSocketUpgrade(r) {
			panic("request should be a websocket upgrade")
		}
		if r.URL.RequestURI() != reqURI {
			panic(fmt.Sprintf("invalid request uri propogated: %s", r.URL.RequestURI()))
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			panic(err)
		}
		_ = conn.Close()
	})

	clientHost := &http.Server{Handler: clientHandler}
	go func() {
		_ = clientHost.Serve(client)
	}()
	defer func() {
		_ = clientHost.Close()
	}()

	conn, _, err := websocket.DefaultDialer.Dial(uri, nil)
	if err != nil {
		t.Fatal(err)
	}
	_ = conn.Close()
}

// Simple test to ensure that proxy authenticates valid Audience claims in jwt
func TestProxyAudClaim(t *testing.T) {
	proxyConfig := Config{
		Upgrader:   upgrader,
		JWTSecretA: []byte("test-secret"),
		JWTSecretB: []byte("another-secret"),
		Domain:     "localhost",
		Port:       80,
		Audience:   "ws-server",
	}

	proxy, err := New(proxyConfig)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(proxy)
	defer server.Close()

	wsURL := util.MakeWsURL(server.URL)
	header := make(http.Header)

	// anonymous function for generating jwt token with aud value
	token := func(id string, aud string, secret []byte) string {
		now := time.Now()
		expires := now.Add(30 * 24 * time.Hour)

		token := jwt.New(jwt.SigningMethodHS256)

		token.Claims.(jwt.MapClaims)["iat"] = now.Unix()
		token.Claims.(jwt.MapClaims)["nbf"] = now.Unix() - 300 // 5 minutes
		token.Claims.(jwt.MapClaims)["iss"] = "taskcluster-auth"
		token.Claims.(jwt.MapClaims)["exp"] = expires.Unix()
		token.Claims.(jwt.MapClaims)["tid"] = id
		token.Claims.(jwt.MapClaims)["aud"] = aud

		tokString, _ := token.SignedString(secret)
		return tokString
	}

	wsworker := token("wsworker", "ws-server", []byte("test-secret"))
	header.Set("Authorization", "Bearer "+wsworker)
	header.Set("x-websocktunnel-id", "wsworker")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)

	if err != nil {
		t.Fatal(err)
	}
	_ = conn.Close()

	wstoken := token("wsworker", "INVALID-AUD", []byte("test-secret"))
	header.Set("Authorization", "Bearer "+wstoken)
	header.Set("x-websocktunnel-id", "wsworker")

	if _, _, err := websocket.DefaultDialer.Dial(wsURL, header); err == nil {
		t.Fatal("Wrong Audience Value accepted")
	}
}
