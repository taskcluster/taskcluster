//go:build darwin || linux || freebsd

package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestDockerWorkerPayloadRejectsEmptyArtifactName verifies that a Docker
// Worker-shaped task payload with an empty-string artifact name is rejected
// by generic-worker's own payload validation - the schema actually enforced
// at task-claim time (via payload_validator_feature.go's use of
// JSONSchema()), which embeds its own separate copy of the Docker Worker
// payload schema distinct from (and previously out of sync with)
// tools/d2g/schemas/docker-worker/v1/payload.yml. No Docker daemon is
// needed here: validation happens before D2G conversion or task execution.
//
// This test is posix-only (build-constrained via the filename, matching
// helper_posix_test.go's convention) because the embedded Docker Worker
// payload schema branch only exists in insecure_posix.yml/multiuser_posix.yml
// - there is no such branch in multiuser_windows.yml, so this test's
// assertions do not apply there.
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

	// D2G is disabled on this test worker pool (and hard-disabled entirely
	// on darwin/freebsd), which would independently reject any Docker
	// Worker payload as malformed-payload regardless of this test's schema
	// fix. Check the specific schema violation to confirm the payload was
	// rejected by the propertyNames pattern, not by D2G being disabled.
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
// Posix-only for the same reason as TestDockerWorkerPayloadRejectsEmptyArtifactName above.
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
