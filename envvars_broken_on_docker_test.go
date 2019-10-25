// +build !docker

package main

import (
	"testing"
)

func TestWorkerLocation(t *testing.T) {
	defer setup(t)()

	oldWorkerLocation := config.WorkerLocation
	defer func(oldWorkerLocation string) {
		config.WorkerLocation = oldWorkerLocation
	}(oldWorkerLocation)

	config.WorkerLocation = `{"cloud":"9","biscuits":"free"}`

	payload := GenericWorkerPayload{
		Command: goRun(
			"check-env.go",
			"TASKCLUSTER_WORKER_LOCATION",
			`{"cloud":"9","biscuits":"free"}`,
			"RUN_ID",
			"0",
			"TASKCLUSTER_ROOT_URL",
			config.RootURL,
		),
		MaxRunTime: 180,
	}

	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}
