package main

import (
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestInteractiveArtifact(t *testing.T) {
	setup(t)
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
