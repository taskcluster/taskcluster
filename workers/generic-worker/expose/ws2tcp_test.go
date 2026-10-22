package expose

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Test that the websocket-to-TCP handler returns once the connection has been
// torn down, rather than leaking a goroutine per connection.
func TestWebsocketToTCPHandlerReturns(t *testing.T) {
	tcpListener, tcpListenerPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}
	defer tcpListener.Close()
	connClosed := tcpEchoServer(tcpListener)

	handlerReturned := make(chan struct{})
	var handlerCtx context.Context
	handler := websocketToTCPHandlerFunc(tcpListenerPort)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(handlerReturned)
		handlerCtx = r.Context()
		handler(w, r)
	}))
	defer server.Close()

	url := fmt.Sprintf("ws%s/", strings.TrimPrefix(server.URL, "http"))
	ws, resp, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("Dial: %s", err)
	}
	defer resp.Body.Close()

	if err := ws.WriteMessage(websocket.BinaryMessage, []byte("Hello")); err != nil {
		t.Fatalf("WriteMessage: %s", err)
	}
	if _, _, err := ws.ReadMessage(); err != nil {
		t.Fatalf("ReadMessage: %s", err)
	}

	ws.Close()
	<-connClosed

	select {
	case <-handlerReturned:
	case <-time.After(5 * time.Second):
		t.Fatal("handler did not return after connection was closed")
	}

	// the keepalive goroutine exits on cancellation of the request context
	select {
	case <-handlerCtx.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("request context was not canceled after handler returned")
	}
}
