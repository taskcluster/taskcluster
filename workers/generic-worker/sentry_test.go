package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// sentryEvent holds the parts of a Sentry event that crash reports rely on
type sentryEvent struct {
	Level     string            `json:"level"`
	Release   string            `json:"release"`
	Tags      map[string]string `json:"tags"`
	Exception []struct {
		Value      string `json:"value"`
		Stacktrace *struct {
			Frames []struct {
				Function string `json:"function"`
			} `json:"frames"`
		} `json:"stacktrace"`
	} `json:"exception"`
}

// captureSentryEvent reports r to a fake Sentry server and returns the event
// it received
func captureSentryEvent(t *testing.T, r any) sentryEvent {
	t.Helper()
	events := make(chan sentryEvent, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path != "/api/42/envelope/" {
			t.Errorf("unexpected request path %q", req.URL.Path)
		}
		// An envelope is newline-delimited JSON: envelope header, item
		// header, then the event itself
		scanner := bufio.NewScanner(req.Body)
		scanner.Buffer(nil, 10*1024*1024)
		var lines []string
		for scanner.Scan() {
			lines = append(lines, scanner.Text())
		}
		if len(lines) < 3 {
			t.Errorf("malformed envelope: %q", lines)
			return
		}
		var event sentryEvent
		if err := json.Unmarshal([]byte(lines[2]), &event); err != nil {
			t.Errorf("could not parse event: %v", err)
		}
		events <- event
	}))
	defer server.Close()

	dsn := strings.Replace(server.URL, "http://", "http://publickey:secretkey@", 1) + "/42"
	sendPanicToSentry(dsn, r, map[string]string{"workerType": "test-worker-type"}, 10*time.Second)

	select {
	case event := <-events:
		return event
	default:
		t.Fatal("no event was sent to sentry")
		return sentryEvent{}
	}
}

func panickingFunction() {
	panic(errors.New("boom"))
}

// TestSendPanicToSentryStackIncludesPanicSite mirrors RunWorker, which reports
// crashes from a deferred recover, and checks that the reported stack trace
// still includes the function that panicked
func TestSendPanicToSentryStackIncludesPanicSite(t *testing.T) {
	var event sentryEvent
	func() {
		defer func() {
			if r := recover(); r != nil {
				event = captureSentryEvent(t, r)
			}
		}()
		panickingFunction()
	}()
	if len(event.Exception) != 1 || event.Exception[0].Stacktrace == nil {
		t.Fatalf("expected one exception with a stack trace, got %+v", event.Exception)
	}
	for _, frame := range event.Exception[0].Stacktrace.Frames {
		if frame.Function == "panickingFunction" {
			return
		}
	}
	t.Errorf("stack trace does not include panickingFunction: %+v", event.Exception[0].Stacktrace.Frames)
}

func TestSendPanicToSentry(t *testing.T) {
	for name, r := range map[string]any{
		"string": "worker exploded",
		"error":  errors.New("worker exploded"),
	} {
		t.Run(name, func(t *testing.T) {
			event := captureSentryEvent(t, r)
			if event.Level != "error" {
				t.Errorf("expected level error, got %q", event.Level)
			}
			if event.Release != "generic-worker@"+version {
				t.Errorf("expected release generic-worker@%v, got %q", version, event.Release)
			}
			if event.Tags["workerType"] != "test-worker-type" {
				t.Errorf("expected workerType tag, got %v", event.Tags)
			}
			if len(event.Exception) != 1 || event.Exception[0].Value != "worker exploded" {
				t.Fatalf("expected one exception with value 'worker exploded', got %+v", event.Exception)
			}
			if event.Exception[0].Stacktrace == nil || len(event.Exception[0].Stacktrace.Frames) == 0 {
				t.Errorf("expected exception to include a stack trace")
			}
		})
	}
}
