//go:build darwin || linux || freebsd

package interactive

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

func TestInteractiveWithReadyCommand(t *testing.T) {
	ctx := t.Context()

	isReadyCreated := false
	cmd := func() (*exec.Cmd, error) { return exec.CommandContext(ctx, "bash"), nil }
	isReadyCmd := func() (*exec.Cmd, error) {
		isReadyCreated = true
		return exec.CommandContext(ctx, "true"), nil
	}

	interactiveCommands := InteractiveCommands{
		IsReadyCmd:     isReadyCmd,
		InteractiveCmd: cmd,
	}

	testInteractive(t, 53766, interactiveCommands, ctx)

	if !isReadyCreated {
		t.Fatalf("The isReady command never got created")
	}
}

func TestInteractiveNormal(t *testing.T) {
	ctx := t.Context()

	cmd := func() (*exec.Cmd, error) { return exec.CommandContext(ctx, "bash"), nil }
	interactiveCommands := InteractiveCommands{
		IsReadyCmd:     nil,
		InteractiveCmd: cmd,
	}

	testInteractive(t, 53765, interactiveCommands, ctx)
}

func testInteractive(t *testing.T, port uint16, interactiveCommands InteractiveCommands, ctx context.Context) {
	t.Helper()
	// Start an interactive session on a test server
	interactive, err := New(port, interactiveCommands, ctx)
	if err != nil {
		t.Fatalf("could not create interactive session: %v", err)
	}
	server := httptest.NewServer(http.HandlerFunc(interactive.Handler))
	defer server.Close()

	// Make a WebSocket connection to the server
	url := "ws" + strings.TrimPrefix(server.URL, "http") + fmt.Sprintf("/shell/%v", interactive.secret)
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
	for range 20 {
		_, output, err = conn.ReadMessage()
		if err != nil {
			t.Fatalf("read error: %v", err)
		}
		completeOutput = append(completeOutput, output...)
		if bytes.Count(completeOutput, expectedBytes) == 2 {
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
}

func TestInteractiveSecretIsPerSession(t *testing.T) {
	ctx := t.Context()

	interactiveCommands := InteractiveCommands{
		IsReadyCmd:     nil,
		InteractiveCmd: func() (InteractiveCmdType, error) { return exec.CommandContext(ctx, "bash"), nil },
	}

	first, err := New(53763, interactiveCommands, ctx)
	if err != nil {
		t.Fatalf("could not create first interactive session: %v", err)
	}
	second, err := New(53764, interactiveCommands, ctx)
	if err != nil {
		t.Fatalf("could not create second interactive session: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(first.Handler))
	defer server.Close()

	resp, err := http.Get(server.URL + "/shell/" + second.secret)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected failure when authenticating to the first session with the second session's secret, got %v", resp.StatusCode)
	}
}
