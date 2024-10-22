package main

import (
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestKVMReturnsMalformedPayload(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		Features: FeatureFlags{
			KVM: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:capability:device:kvm:freebsd/kvm")

	// This test is expected to fail with malformed payload
	// because kvm feature toggle is not supported on FreeBSD
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}
