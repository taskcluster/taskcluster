//go:build darwin || linux || freebsd

package interactive

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

func TestInteractive(t *testing.T) {
	// Start an interactive session on a test server
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cmd := func() (*exec.Cmd, error) { return exec.CommandContext(ctx, "bash"), nil }
	interactive, err := New(53765, cmd, ctx)
	if err != nil {
		t.Fatalf("could not create interactive session: %v", err)
	}
	server := httptest.NewServer(http.HandlerFunc(interactive.Handler))
	defer server.Close()

	// Make a WebSocket connection to the server
	url := "ws" + strings.TrimPrefix(server.URL, "http") + fmt.Sprintf("/shell/%v", os.Getenv("INTERACTIVE_ACCESS_TOKEN"))
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal("dial error:", err)
	}
	const SENTINEL = "S3ntin3lValue"

	// Send some input to the interactive session
	input := fmt.Sprintf("\x01echo %s\n", SENTINEL)
	err = conn.WriteMessage(websocket.TextMessage, []byte(input))
	if err != nil {
		t.Fatal("write error:", err)
	}

	// Wait for the output from the interactive session
	var output []byte
	expectedBytes := []byte(SENTINEL)
	completeOutput := []byte{}
	ok := false
	for i := 0; i < 20; i++ {
		_, output, err = conn.ReadMessage()
		if err != nil {
			t.Fatalf("read error: %v", err)
		}
		completeOutput = append(completeOutput, output...)
		if bytes.Count(completeOutput, expectedBytes) == 3 {
			ok = true
			break
		}
	}

	nonExpectedBytes := []byte("Inappropriate ioctl for device")
	if bytes.Contains(completeOutput, nonExpectedBytes) {
		t.Fatalf("Bash complained about ioctls (%v)", completeOutput)
	}

	if !ok {
		t.Fatalf("Couldn't find expected output: %v. Complete output: %v", expectedBytes, completeOutput)
	}

	err = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "Closing connection"))
	if err != nil {
		t.Fatalf("Error sending WebSocket close message: %v", err)
	}

	_, _, err = conn.ReadMessage()
	if err != nil {
		if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure) {
			t.Fatalf("Unexpected close error: %v", err)
		}
	}

	err = conn.Close()
	if err != nil {
		t.Fatalf("Error closing WebSocket connection: %v", err)
	}

	// Terminate the interactive session
	cancel()
}
