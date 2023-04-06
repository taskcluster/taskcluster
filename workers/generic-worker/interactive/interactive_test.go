package interactive

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

func TestInteractive(t *testing.T) {
	// Start an interactive session on a test server
	interactive := New(53654)
	server := httptest.NewServer(http.HandlerFunc(interactive.Handler))
	defer server.Close()

	// Make a WebSocket connection to the server
	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/"
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal("dial error:", err)
	}
	defer conn.Close()

	// Send some input to the interactive session
	input := "echo hello\n"
	err = conn.WriteMessage(websocket.TextMessage, []byte(input))
	if err != nil {
		t.Fatal("write error:", err)
	}

	// Wait for the output from the interactive session
	_, output, err := conn.ReadMessage()
	if err != nil {
		t.Fatal("read error:", err)
	}
	expected := "hello\n"
	if string(output) != expected {
		t.Fatalf("unexpected output: %v\nexpected: %v", string(output), expected)
	}

	input = "notABashCommand\n"
	err = conn.WriteMessage(websocket.TextMessage, []byte(input))
	if err != nil {
		t.Fatal("write error:", err)
	}

	// Wait for the output from the interactive session
	_, output, err = conn.ReadMessage()
	if err != nil {
		t.Fatal("read error:", err)
	}
	expected = "bash: line 2: notABashCommand: command not found\n"
	if string(output) != expected {
		t.Fatalf("unexpected output: %v\nexpected: %v", string(output), expected)
	}

	// Terminate the interactive session
	err = interactive.Terminate()
	if err != nil {
		t.Fatal("terminate error:", err)
	}
}
