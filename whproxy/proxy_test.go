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

func TestProxyRegister(t *testing.T) {
	//  start proxy server
	proxy := New(Config{Upgrader: upgrader, Logger: genLogger("register-test")})
	server := httptest.NewServer(proxy.GetHandler())
	defer server.Close()

	// get url
	wsURL := util.MakeWsURL(server.URL)

	// create address to dial
	workerID := "validWorkerID"
	dialAddr := wsURL + "/register/" + workerID

	// dial connection to proxy
	conn1, _, err := websocket.DefaultDialer.Dial(dialAddr, nil)
	if err != nil {
		t.Fatal(err)
	}

	defer func() {
		_ = conn1.Close()
	}()
	// second connection should fail
	conn2, _, err := websocket.DefaultDialer.Dial(dialAddr, nil)
	if err == nil {
		defer func() {
			_ = conn2.Close()
		}()
		t.Fatalf("bad status code: connection should fail")
	}
}

// TestProxyRequest
func TestProxyRequest(t *testing.T) {
	proxy := New(Config{Upgrader: upgrader, Logger: genLogger("request-test")})
	server := httptest.NewServer(proxy.GetHandler())
	defer server.Close()

	// get url
	wsURL := util.MakeWsURL(server.URL)
	// makeshift client
	clientWs, _, err := websocket.DefaultDialer.Dial(wsURL+"/register/workerID", nil)
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
	proxy := New(Config{Upgrader: upgrader})
	server := httptest.NewServer(proxy.GetHandler())
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
	clientWs, _, err := websocket.DefaultDialer.Dial(wsURL+"/register/wsWorker/", nil)
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
	proxy := New(Config{Upgrader: upgrader})
	//serve proxy
	server := httptest.NewServer(proxy.GetHandler())
	wsURL := util.MakeWsURL(server.URL)
	defer server.Close()

	// mechanism to know test has completed
	var wg sync.WaitGroup
	wg.Add(2)
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

		// Read message to make sure ping was received
		for {
			_, _, err = conn.NextReader()
			if err != nil {
				break
			}
		}
	})

	// register worker and serve http
	clientWs, _, err := websocket.DefaultDialer.Dial(wsURL+"/register/wsWorker/", nil)
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

	// ****************************
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
	proxy := New(Config{Upgrader: upgrader})
	//serve proxy
	server := httptest.NewServer(proxy.GetHandler())
	wsURL := util.MakeWsURL(server.URL)
	defer server.Close()

	// mechanism to know test has completed
	var wg sync.WaitGroup
	wg.Add(1)
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

		for {
			_, _, err = conn.NextReader()
			if err != nil && websocket.IsCloseError(err, websocket.CloseAbnormalClosure) {
				logger.Printf("closed")
				wg.Done()
				break
			}
			if err != nil {
				t.Fatal(err)
			}
		}

	})

	// register worker and serve http
	clientWs, _, err := websocket.DefaultDialer.Dial(wsURL+"/register/wsWorker/", nil)
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
	case <-done():
	}

}
