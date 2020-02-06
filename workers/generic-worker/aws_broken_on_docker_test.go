// +build !docker

package main

import (
	"testing"
)

func TestWorkerShutdown(t *testing.T) {
	m := &MockAWSProvisionedEnvironment{
		Terminating: true,
	}
	teardown, err := m.Setup(t)
	defer teardown()
	m.ExpectNoError(t, err)
	payload := GenericWorkerPayload{
		Command:    sleep(20),
		MaxRunTime: 15,
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "worker-shutdown")
}
