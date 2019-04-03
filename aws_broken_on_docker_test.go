// +build !dockerEngine

package main

import (
	"testing"
)

func TestWorkerShutdown(t *testing.T) {
	m := &MockAWSProvisionedEnvironment{
		Terminating: true,
	}
	defer m.ExpectNoError(t)()
	payload := GenericWorkerPayload{
		Command:    sleep(20),
		MaxRunTime: 15,
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "worker-shutdown")
}
