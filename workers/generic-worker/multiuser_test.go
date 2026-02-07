//go:build multiuser

package main

import (
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/host"
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

// TestPrivilegedGenericWorkerBinaryFailsWorkerAndTask tests that when the generic-worker binary
// is not accessible to task users (e.g., in a secured directory), the worker exits
// with INTERNAL_ERROR and the task is reported as exception/internal-error.
func TestPrivilegedGenericWorkerBinaryFailsWorkerAndTask(t *testing.T) {
	setup(t)

	goPath, err := host.Output("go", "env", "GOPATH")
	if err != nil {
		t.Fatalf("Could not get GOPATH: %v", err)
	}
	if goPath == "" {
		t.Fatal("GOPATH is empty")
	}
	goPath = strings.TrimSpace(goPath)

	permissionsBefore, resetPermissions, err := fileutil.GetPermissions(goPath)
	if err != nil {
		t.Fatalf("Could not get permissions of GOPATH (before): %v", err)
	}

	err = fileutil.SecureFiles(goPath)
	if err != nil {
		t.Fatalf("Could not secure GOPATH: %v", err)
	}
	defer func() {
		err := resetPermissions()
		if err != nil {
			t.Fatalf("Could not reset permissions of GOPATH: %v", err)
		}

		permissionsAfter, _, err := fileutil.GetPermissions(goPath)
		if err != nil {
			t.Fatalf("Could not get permissions of GOPATH (after): %v", err)
		}

		if permissionsBefore != permissionsAfter {
			t.Fatalf("Permissions changed from %s to %s", permissionsBefore, permissionsAfter)
		}
	}()

	// Submit a task - it should fail with internal-error because the binary isn't accessible
	// and the worker should exit with INTERNAL_ERROR (not TASKS_COMPLETE)
	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)
	taskID := scheduleTask(t, td, payload)
	t.Logf("Scheduled task %s", taskID)

	// Worker should exit with INTERNAL_ERROR because binary validation fails
	execute(t, INTERNAL_ERROR)

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
