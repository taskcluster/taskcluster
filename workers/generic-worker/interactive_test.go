//go:build darwin || linux || freebsd

package main

import (
	"bytes"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/mcuadros/go-defaults"
)

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

	done := make(chan string, 1)
	go func() {
		done <- submitAndAssert(t, td, payload, "completed", "completed")
	}()
	// Ensure we wait for the worker goroutine to finish to avoid race with next test's teardown
	defer func() { <-done }()

	// Wait for server to start
	timeout := time.After(10 * time.Second)
	tick := time.Tick(500 * time.Millisecond)

	var conn *websocket.Conn
	var err error
	const SENTINEL = "S3ntin3lValue"

	for {
		select {
		case <-timeout:
			// Timeout reached
			t.Fatal("timeout waiting for server to start")
		case <-tick:
			// Try to connect to the server
			url := fmt.Sprintf("ws://localhost:%v/shell/%v", config.InteractivePort, os.Getenv("INTERACTIVE_ACCESS_TOKEN"))
			conn, _, err = websocket.DefaultDialer.Dial(url, nil)
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
					if bytes.Count(completeOutput, expectedBytes) == 3 {
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
				t.Logf("error connecting to server: %v", err)
			}
		}
	}
}

func TestInteractiveWrongSecret(t *testing.T) {
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

	done := make(chan string, 1)
	go func() {
		done <- submitAndAssert(t, td, payload, "completed", "completed")
	}()

	// Wait for server to start
	timeout := time.After(10 * time.Second)
	tick := time.Tick(500 * time.Millisecond)

	timedOut := false
	for !timedOut {
		select {
		case <-done:
			return
		case <-timeout:
			// Timeout reached, could not connect to server
			// which should be the case since we are using the wrong secret
			timedOut = true
		case <-tick:
			// Try to connect to the server
			url := fmt.Sprintf("ws://localhost:%v/shell/%v", config.InteractivePort, "bad-secret")
			_, _, err := websocket.DefaultDialer.Dial(url, nil)
			if err == nil {
				t.Fatal("expected error connecting to server")
			}
		}
	}
	// Wait for the worker goroutine to finish to avoid race with next test's teardown
	<-done
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
