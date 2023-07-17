//go:build darwin

package main

import (
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestLoopbackAudioReturnsMalformedPayload(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		Features: FeatureFlags{
			LoopbackAudio: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:loopback-audio")

	// This test is expected to fail with malformed payload
	// because loopback audio is not supported on macOS
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}
