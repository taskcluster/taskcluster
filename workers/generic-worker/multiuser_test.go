//go:build multiuser

package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v116/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v116/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v116/workers/generic-worker/runtime"
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

// breakTaskUserHelper makes the generic-worker helper subcommands that run as
// the task user fail to start, by pointing the binary lookup at an empty
// GOPATH.
func breakTaskUserHelper(t *testing.T) *process.PlatformData {
	t.Helper()
	pd, err := platformDataForTaskContext(taskContext)
	if err != nil {
		t.Fatalf("Could not get platform data for task user: %v", err)
	}
	t.Setenv("GOPATH", t.TempDir())
	return pd
}

// TestCreateFileAsTaskUserFailsIfHelperCannotStart tests that a file is not
// opened by the worker when the task user helper that should create it never
// ran, since the helper is what checks the task user may write there.
func TestCreateFileAsTaskUserFailsIfHelperCannotStart(t *testing.T) {
	setup(t)

	file := filepath.Join(t.TempDir(), "existing-file")
	if err := os.WriteFile(file, []byte("original"), 0644); err != nil {
		t.Fatalf("Could not write %v: %v", file, err)
	}
	pd := breakTaskUserHelper(t)

	f, err := CreateFileAsTaskUser(file, taskContext, pd)
	if err == nil {
		_ = f.Close()
		t.Fatalf("Expected CreateFileAsTaskUser to fail when its helper cannot start, but it opened %v", file)
	}
}

// TestUnarchiveFailsIfHelperCannotStart tests that unarchiving reports an
// error when the task user helper that should extract the archive never ran.
func TestUnarchiveFailsIfHelperCannotStart(t *testing.T) {
	setup(t)

	src := filepath.Join(testdataDir, "unknown_issuer_app_1.zip")
	dst := filepath.Join(taskContext.TaskDir, t.Name())
	pd := breakTaskUserHelper(t)

	if err := unarchive(src, dst, "zip", taskContext, pd); err == nil {
		t.Fatalf("Expected unarchive to fail when its helper cannot start")
	}
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
