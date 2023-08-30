//go:build freebsd

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
	td.Scopes = append(td.Scopes, "generic-worker:loopback-audio:freebsd/loopback-audio")

	// This test is expected to fail with malformed payload
	// because loopback audio is not supported on FreeBSD
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}
