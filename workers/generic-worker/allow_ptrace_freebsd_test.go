package main

import (
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestAllowPtraceReturnsMalformedPayload(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		Features: FeatureFlags{
			AllowPtrace: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:feature:allowPtrace")

	// This test is expected to fail with malformed payload
	// because allowPtrace feature toggle is not supported on FreeBSD
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}
