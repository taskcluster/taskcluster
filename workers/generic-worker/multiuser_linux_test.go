//go:build multiuser

package main

import (
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestTaskUserCredentialsEnvVarIsWrittenAsCurrentUser(t *testing.T) {
	setup(t)
	config.EnableRunTaskAsCurrentUser = true

	payload := GenericWorkerPayload{
		Command: [][]string{{
			"echo", "${TASK_USER_CREDENTIALS:?Error: TASK_USER_CREDENTIALS not set}",
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

	_ = submitAndAssert(t, td, payload, "completed", "completed")
	logtext := LogText(t)
	if strings.Contains(logtext, "Error: TASK_USER_CREDENTIALS not set") {
		t.Fatalf("Was expecting log file to not contain \"Error: TASK_USER_CREDENTIALS not set\", but it does: \n%v", logtext)
	}
}

func TestXDGRuntimeDirEnvVarIsRemovedAsCurrentUser(t *testing.T) {
	setup(t)
	config.EnableRunTaskAsCurrentUser = true

	payload := GenericWorkerPayload{
		Command: [][]string{{
			"echo", "${XDG_RUNTIME_DIR:?Success: XDG_RUNTIME_DIR not set}",
		}},
		Env: map[string]string{
			"XDG_RUNTIME_DIR": "/run/user/1000",
		},
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

	_ = submitAndAssert(t, td, payload, "failed", "failed")
	logtext := LogText(t)
	if !strings.Contains(logtext, "Success: XDG_RUNTIME_DIR not set") {
		t.Fatalf("Was expecting log file to contain \"Success: XDG_RUNTIME_DIR not set\", but it doesn't: \n%v", logtext)
	}
}
