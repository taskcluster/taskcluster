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
		Env: map[string]string{
			"STRANGE_VAR": `()%!^"<>&|%3 r %!4 %~4RS %3 %PATH% %% "  tt`,
		},
		Command: append(
			// In multiuser engine on Windows, the env vars are exported to a
			// file at the end of each command, and then imported by the
			// wrapper script at the start of the following command. Therefore
			// make sure we have at least two commands in order to also test
			// export/import of env vars between commands.
			helloGoodbye(),
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

	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}
