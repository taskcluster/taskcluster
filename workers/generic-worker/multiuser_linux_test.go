package main

import (
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestXDGRuntimeDirEnvVarIsRemovedAsCurrentUser(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command: [][]string{{
			"/usr/bin/env",
			"bash",
			"-c",
			"echo ${XDG_RUNTIME_DIR:?Success: XDG_RUNTIME_DIR not set}",
		}},
		MaxRunTime: 180,
		Features: FeatureFlags{
			RunTaskAsCurrentUser: true,
		},
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)
	td.Scopes = append(td.Scopes,
		"generic-worker:run-task-as-current-user:"+td.ProvisionerID+"/"+td.WorkerType,
	)

	// note: this test is expected to fail
	// as the XDG_RUNTIME_DIR env var is removed
	// from the environment when running as the current user
	// on linux in non-headless environments
	_ = submitAndAssert(t, td, payload, "failed", "failed")
}
