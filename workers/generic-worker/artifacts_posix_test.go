//go:build darwin || linux || freebsd

package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDockerWorkerPayloadRejectsInvalidLogName(t *testing.T) {
	setup(t)

	td := testTask(t)
	td.Payload = json.RawMessage(`{
		"image": "ubuntu:latest",
		"command": ["echo", "hello"],
		"maxRunTime": 30,
		"log": "public/logs/a\nb.log"
	}`)

	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, `Does not match pattern '^[\x20-\x7e]+$'`) {
		t.Fatalf("Was expecting log to explain that the Docker Worker payload's log field violates the pattern, but it doesn't: \n%v", logtext)
	}
}
