package main

import (
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestTaskclusterInstanceType(t *testing.T) {
	setup(t)

	oldInstanceType := config.InstanceType
	defer func(oldInstanceType string) {
		config.InstanceType = oldInstanceType
	}(oldInstanceType)

	config.InstanceType = "verybiginstance"

	payload := GenericWorkerPayload{
		Env: map[string]string{
			"STRANGE_VAR": `()%!^"<>&|%3 r %!4 %~4RS %3 %PATH% %% "  tt`,
		},
		Command: append(
			[][]string{
				{
					"ls",
					"-l",
					"$GOROOT",
				},
			},
			goRun(
				"check-env.go",
				"TASKCLUSTER_INSTANCE_TYPE",
				"verybiginstance",
				"RUN_ID",
				"0",
				"TASKCLUSTER_ROOT_URL",
				config.RootURL,
				"STRANGE_VAR",
				`()%!^"<>&|%3 r %!4 %~4RS %3 %PATH% %% "  tt`,
			)...,
		),
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

func TestWorkerLocation(t *testing.T) {
	setup(t)

	oldWorkerLocation := config.WorkerLocation
	defer func(oldWorkerLocation string) {
		config.WorkerLocation = oldWorkerLocation
	}(oldWorkerLocation)

	config.WorkerLocation = `{"cloud":"9","biscuits":"free"}`

	payload := GenericWorkerPayload{
		Env: map[string]string{
			"STRANGE_VAR": `()%!^"<>&|%3 r %!4 %~4RS %3 %PATH% %% "  tt`,
		},
		Command: append(
			[][]string{
				{
					"ls",
					"-l",
					"$GOROOT",
				},
			},
			goRun(
				"check-env.go",
				"TASKCLUSTER_WORKER_LOCATION",
				`{"cloud":"9","biscuits":"free"}`,
				"RUN_ID",
				"0",
				"TASKCLUSTER_ROOT_URL",
				config.RootURL,
				"STRANGE_VAR",
				`()%!^"<>&|%3 r %!4 %~4RS %3 %PATH% %% "  tt`,
			)...,
		),
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}
