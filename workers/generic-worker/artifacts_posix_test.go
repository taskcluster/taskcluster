//go:build darwin || linux || freebsd

package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestDockerWorkerPayloadRejectsEmptyArtifactName verifies that a Docker
// Worker-shaped task payload with an empty-string artifact name is rejected
// by generic-worker's own payload validation.
//
// See https://github.com/taskcluster/taskcluster/issues/9007
func TestDockerWorkerPayloadRejectsEmptyArtifactName(t *testing.T) {
	setup(t)

	td := testTask(t)
	td.Payload = json.RawMessage(`{
		"image": "ubuntu:latest",
		"command": ["echo", "hello"],
		"maxRunTime": 30,
		"artifacts": {
			"": {
				"path": "/home/worker/artifacts/output.txt",
				"type": "file"
			}
		}
	}`)

	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "exception", "malformed-payload")

	// Check the specific schema violation to confirm the payload was rejected
	// by the propertyNames pattern, not by e.g. D2G being disabled.
	logtext := LogText(t)
	if !strings.Contains(logtext, `Does not match pattern '^[\x20-\x7e]+$'`) {
		t.Fatalf("Was expecting log to explain that the empty artifact name violates the propertyNames pattern, but it doesn't: \n%v", logtext)
	}
}

// TestDockerWorkerPayloadRejectsInvalidLogName is the Docker Worker payload
// equivalent of TestInvalidLiveLogNameFailsAsMalformedPayload: the embedded
// copy of the Docker Worker payload schema's `log` field must enforce the
// same pattern as the native logs.live/logs.backing fields.
//
// See https://github.com/taskcluster/taskcluster/issues/9007
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
