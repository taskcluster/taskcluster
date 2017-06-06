package whclient

import (
	"bufio"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	log "github.com/sirupsen/logrus"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

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

var upgrader = websocket.Upgrader{}

// Checks if connection tries until max elapsed time and counts retries
func TestExponentialBackoffSuccess(t *testing.T) {
	// no race condition here so no mutex needed
	count := 0
	failCount := 3
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if websocket.IsWebSocketUpgrade(r) {
			if count < failCount {
				count++
				http.Error(w, http.StatusText(500), 500)
				return
			}
			_, _ = upgrader.Upgrade(w, r, nil)
		}
	})
	server := httptest.NewServer(handler)
	defer server.Close()

	client := &Client{
		ID:        "workerID",
		ProxyAddr: util.MakeWsURL(server.URL),
	}
	_, err := client.GetListener(true)
	if err != nil {
		t.Fatal(err)
	}
	if count != failCount {
		t.Fatalf("not enough retries")
	}
}

// Checks if reconnect runs for MaxElapsedTime and then fails
func TestExponentialBackoffFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, http.StatusText(500), 500)
	}))
	defer server.Close()

	client := &Client{
		ID:        "workerID",
		ProxyAddr: util.MakeWsURL(server.URL),
	}

	client.Retry.InitialDelay = 200 * time.Millisecond
	client.Retry.MaxElapsedTime = 2 * time.Second

	start := time.Now()
	_, err := client.GetListener(true)
	end := time.Now()

	if err == nil {
		t.Fatalf("should fail")
	}

	if end.Sub(start) < client.Retry.MaxElapsedTime {
		t.Fatalf("should run for atleast %d milliseconds", client.Retry.MaxElapsedTime)
	}

	// maximum time accounting for jitter
	maxTime := client.Retry.MaxElapsedTime + 200*time.Millisecond
	if end.Sub(start) > maxTime {
		t.Fatalf("should not run for more than %d milliseconds", maxTime)
	}
}

// Check if client session can handle simple http
func TestClientCanServeHTTP(t *testing.T) {
	// Create a handler for the client
	clientMux := mux.NewRouter()
	clientMux.Handle("/valid", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := w.Write([]byte("valid"))
		if err != nil {
			t.Fatal(err)
		}
	}))

	logger := genLogger("client-http-test")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if websocket.IsWebSocketUpgrade(r) {
			conn, err := upgrader.Upgrade(w, r, nil)
			if err != nil {
				t.Fatal(err)
			}
			session := wsmux.Server(conn, wsmux.Config{Log: genLogger("client-http-session-test")})

			// make request to supported endpoint
			reqStream, err := session.Open()
			if err != nil {
				t.Fatal(err)
			}
			req, err := http.NewRequest(http.MethodGet, "/valid", nil)
			if err != nil {
				t.Fatal(err)
			}
			err = req.Write(reqStream)
			if err != nil {
				t.Fatal(err)
			}
			_ = reqStream.Close()

			reader := bufio.NewReader(reqStream)
			response, err := http.ReadResponse(reader, req)
			if response == nil {
				t.Fatal("response must not be nil")
			}
			logger.Print(response)
			if response.StatusCode != 200 {
				t.Fatal("request unsuccessful")
			}

			// make request to unsupported endpoint
			// should fail
			reqStream, err = session.Open()
			if err != nil {
				t.Fatal(err)
			}
			req, err = http.NewRequest(http.MethodGet, "/", nil)
			if err != nil {
				t.Fatal(err)
			}
			err = req.Write(reqStream)
			if err != nil {
				t.Fatal(err)
			}
			_ = reqStream.Close()

			reader = bufio.NewReader(reqStream)
			response, err = http.ReadResponse(reader, req)
			if response == nil {
				t.Fatal("response must not be nil")
			}
			logger.Print(response)
			if response.StatusCode != 404 {
				t.Fatalf("response code was %d. must be : 404", response.StatusCode)
			}
			_ = conn.Close()
			return
		}
		http.Error(w, "unauthorised", 401)
	}))

	defer server.Close()

	clServer := &http.Server{Handler: clientMux}
	client := &Client{
		ID:        "workerID",
		ProxyAddr: util.MakeWsURL(server.URL),
	}

	clientSession, err := client.GetListener(true)
	if err != nil {
		t.Fatal(err)
	}

	_ = clServer.Serve(clientSession)
}

// Ensure that client does not retry if error is 4xx
func TestRetryStops4xx(t *testing.T) {
	tryCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tryCount++
		if websocket.IsWebSocketUpgrade(r) && tryCount == 1 {
			http.Error(w, http.StatusText(500), 500)
			return
		}
		http.Error(w, http.StatusText(400), 400)
	}))
	defer server.Close()

	client := &Client{ID: "workerID", ProxyAddr: util.MakeWsURL(server.URL)}
	// attempt to connect with retry
	_, err := client.GetListener(true)
	if err == nil {
		t.Fatal("connection should fail")
	}
	if tryCount != 2 {
		t.Fatal("only 2 connection attempts should occur")
	}
}
