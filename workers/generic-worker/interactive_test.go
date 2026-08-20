//go:build darwin || linux || freebsd

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"os"
	"path"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v105/clients/client-go/tcqueue"
)

func skipWithoutShellArtifactAccess(t *testing.T) {
	t.Helper()
	if os.Getenv("GW_TESTS_USE_EXTERNAL_TASKCLUSTER") != "" {
		t.Skip("This test cannot run against an external taskcluster, it needs scopes to access private artifacts")
	}
}

func interactiveShellURL(t *testing.T, taskID string) (*url.URL, error) {
	t.Helper()
	const artifactName = "private/generic-worker/shell.html"
	queue := serviceFactory.Queue(config.Credentials(), config.RootURL)
	content, err := queue.LatestArtifact(taskID, artifactName)
	if err != nil {
		// The artifact is not published yet, the tick loop will retry for us
		return nil, err
	}

	var reference tcqueue.GetArtifactContentResponse3
	if err := json.Unmarshal(*content, &reference); err != nil {
		t.Fatalf("Could not unmarshal interactive artifact as a reference one: %v", err)
	}

	shellURL, err := url.Parse(reference.URL)
	if err != nil {
		t.Fatalf("Could not parse shell URL %q: %v", reference.URL, err)
	}

	query := shellURL.Query()
	if !query.Has("socketUrl") {
		t.Fatalf("Shell URL %q does not include a socketUrl parameter?", reference.URL)
	}

	socketURL, err := url.Parse(query.Get("socketUrl"))
	if err != nil {
		t.Fatalf("Could not parse socketUrl parameter of shell URL %q: %v", reference.URL, err)
	}

	// the exposure advertises config.PublicIP which might not be localhost but
	// it listens on all interfaces.
	socketURL.Host = net.JoinHostPort("localhost", socketURL.Port())
	return socketURL, nil
}

func TestInteractiveArtifact(t *testing.T) {
	setup(t)

	oldEnableInteractive := config.EnableInteractive
	defer func(oldEnableInteractive bool) {
		config.EnableInteractive = oldEnableInteractive
	}(oldEnableInteractive)
	config.EnableInteractive = true

	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 10,
		Features: FeatureFlags{
			Interactive: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	expectedArtifacts := ExpectedArtifacts{
		"public/logs/live_backing.log": {
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
			Expires:         td.Expires,
		},
		"public/logs/live.log": {
			Extracts: []string{
				"exit 0",
				"=== Task Finished ===",
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
			Expires:         td.Expires,
		},
		"private/generic-worker/shell.html": {
			ContentType:      "text/html; charset=utf-8",
			SkipContentCheck: true,
		},
	}

	expectedArtifacts.Validate(t, taskID, 0)
}

func TestInteractiveCommand(t *testing.T) {
	skipWithoutShellArtifactAccess(t)
	setup(t)

	oldEnableInteractive := config.EnableInteractive
	defer func(oldEnableInteractive bool) {
		config.EnableInteractive = oldEnableInteractive
	}(oldEnableInteractive)
	config.EnableInteractive = true

	payload := GenericWorkerPayload{
		Command:    sleep(5),
		MaxRunTime: 10,
		Features: FeatureFlags{
			Interactive: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	taskID := scheduleTask(t, td, payload)

	done := make(chan struct{})
	go func() {
		defer close(done)
		ensureResolution(t, taskID, "completed", "completed")
	}()
	// Ensure we wait for the worker goroutine to finish to avoid race with next test's teardown
	defer func() { <-done }()

	// Wait for server to start
	timeout := time.After(10 * time.Second)
	tick := time.Tick(500 * time.Millisecond)

	var conn *websocket.Conn
	var err error
	var lastErr error
	const SENTINEL = "S3ntin3lValue"

	for {
		select {
		case <-timeout:
			// Timeout reached
			t.Fatalf("timeout waiting for server to start, last error: %v", lastErr)
		case <-tick:
			// Try to connect to the server
			shellURL, serr := interactiveShellURL(t, taskID)
			if serr != nil {
				lastErr = serr
				continue
			}
			conn, _, err = websocket.DefaultDialer.Dial(shellURL.String(), nil)
			if err == nil {
				err = conn.WriteMessage(websocket.TextMessage, fmt.Appendf(nil, "\x01echo %s\n", SENTINEL))
				if err != nil {
					t.Fatalf("write error: %v", err)
				}

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
				// defer handles waiting for done
				return
			} else {
				lastErr = err
				t.Logf("error connecting to server: %v", err)
			}
		}
	}
}

func TestInteractiveWrongSecret(t *testing.T) {
	skipWithoutShellArtifactAccess(t)
	setup(t)

	oldEnableInteractive := config.EnableInteractive
	defer func(oldEnableInteractive bool) {
		config.EnableInteractive = oldEnableInteractive
	}(oldEnableInteractive)
	config.EnableInteractive = true

	payload := GenericWorkerPayload{
		Command:    sleep(5),
		MaxRunTime: 10,
		Features: FeatureFlags{
			Interactive: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	taskID := scheduleTask(t, td, payload)

	done := make(chan struct{})
	go func() {
		defer close(done)
		ensureResolution(t, taskID, "completed", "completed")
	}()
	// Ensure we wait for the worker goroutine to finish to avoid race with next test's teardown
	defer func() { <-done }()

	// Wait for server to start
	timeout := time.After(10 * time.Second)
	tick := time.Tick(500 * time.Millisecond)

	attempted := false
	var lastErr error
loop:
	for {
		select {
		case <-done:
			break loop
		case <-timeout:
			// Timeout reached, could not connect to server
			// which should be the case since we are using the wrong secret
			break loop
		case <-tick:
			// Try to connect to the server
			shellURL, err := interactiveShellURL(t, taskID)
			if err != nil {
				lastErr = err
				continue
			}
			shellURL.Path = path.Join(path.Dir(shellURL.Path), "bad-secret")
			attempted = true
			_, _, err = websocket.DefaultDialer.Dial(shellURL.String(), nil)
			if err == nil {
				t.Fatal("expected error connecting to server")
			}
		}
	}

	if !attempted {
		t.Fatalf("The shell.html artifact was never fetched, last error: %v", lastErr)
	}
}

func TestInteractiveNoConfigSetMalformedPayload(t *testing.T) {
	setup(t)

	oldEnableInteractive := config.EnableInteractive
	defer func(oldEnableInteractive bool) {
		config.EnableInteractive = oldEnableInteractive
	}(oldEnableInteractive)
	config.EnableInteractive = false

	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 10,
		Features: FeatureFlags{
			Interactive: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}
