//go:build multiuser

package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/fileutil"
	gwruntime "github.com/taskcluster/taskcluster/v110/workers/generic-worker/runtime"
)

// TestWhoAmI tests that the correct user is running the task, based on value of payload feature toggle RunTaskAsCurrentUser
func TestWhoAmI(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    goRun("whoami.go", "false"),
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

func TestWhoAmIAsCurrentUser(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    goRun("whoami.go", "true"),
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
}

func TestTaskUserCredentialsEnvVarIsWrittenAsCurrentUser(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    goRun("check-task-user-credentials.go"),
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
}

// TestPrivilegedGenericWorkerBinaryFailsTask tests that when the generic-worker binary
// can't be reached, the task is reported as exception/internal-error but the
// worker continues normally.
func TestPrivilegedGenericWorkerBinaryFailsTask(t *testing.T) {
	setup(t)

	// The worker looks its own binary up through GOPATH when running tests, so
	// point that at a copy of it and wreck that one.
	gopath := t.TempDir()
	binary := filepath.Join(gopath, "bin", filepath.Base(gwruntime.GenericWorkerBinary()))
	if err := os.MkdirAll(filepath.Dir(binary), 0755); err != nil {
		t.Fatalf("Could not create %v: %v", filepath.Dir(binary), err)
	}
	if _, err := fileutil.Copy(binary, gwruntime.GenericWorkerBinary()); err != nil {
		t.Fatalf("Could not copy the generic-worker binary to %v: %v", binary, err)
	}
	t.Setenv("GOPATH", gopath)

	makeFileUnreachable(t, binary)

	// Submit a task - it should fail with internal-error because the binary isn't accessible
	// but the worker should continue normally (not crash with INTERNAL_ERROR)
	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)
	taskID := scheduleTask(t, td, payload)
	t.Logf("Scheduled task %s", taskID)

	// Worker continues normally — the failed task is reported as exception
	// but does not kill the worker
	execute(t, TASKS_COMPLETE)

	// Verify the task was reported as exception/internal-error
	queue := serviceFactory.Queue(config.Credentials(), config.RootURL)
	status, err := queue.Status(taskID)
	if err != nil {
		t.Fatalf("Error retrieving status from queue: %v", err)
	}
	if status.Status.Runs[0].State != "exception" || status.Status.Runs[0].ReasonResolved != "internal-error" {
		t.Fatalf("Expected task to resolve as 'exception/internal-error' but resolved as '%v/%v'",
			status.Status.Runs[0].State, status.Status.Runs[0].ReasonResolved)
	}
	t.Logf("Task %v resolved as exception/internal-error as required.", taskID)
}
