package whclient

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
)

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
				http.NotFound(w, r)
				return
			}
			_, _ = upgrader.Upgrade(w, r, nil)
		}
	})
	server := httptest.NewServer(handler)
	defer server.Close()

	client := &Client{
		Id:        "workerID",
		ProxyAddr: util.MakeWsURL(server.URL),
	}
	_, err := client.GetSession(true)
	if err != nil {
		t.Fatal(err)
	}
	if count != failCount {
		t.Fatalf("not enough retries")
	}
}

// Checks if reconnect runs for MaxElapsedTime and then fails
func TestExponentialBackoffFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(http.NotFound))
	defer server.Close()

	client := &Client{
		Id:        "workerID",
		ProxyAddr: util.MakeWsURL(server.URL),
	}

	client.Retry.InitialInterval = 200 * time.Millisecond
	client.Retry.MaxElapsedTime = 2 * time.Second

	start := time.Now()
	_, err := client.GetSession(true)
	end := time.Now()

	if err == nil {
		t.Fatalf("should fail")
	}

	if end.Sub(start) < client.Retry.MaxElapsedTime {
		t.Fatalf("should run for atleast %s seconds", client.Retry.MaxElapsedTime)
	}
}
