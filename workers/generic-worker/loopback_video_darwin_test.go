//go:build darwin

package main

import (
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestLoopbackVideoReturnsMalformedPayload(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		Features: FeatureFlags{
			LoopbackVideo: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:loopback-video")

	// This test is expected to fail with malformed payload
	// because loopback video is not supported on macOS
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}
