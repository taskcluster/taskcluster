//go:build multiuser

package main

import (
	"strconv"
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v77/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v77/workers/generic-worker/host"
)

// TestWhoAmI tests that the correct user is running the task, based on value of config setting RunTasksAsCurrentUser
func TestWhoAmI(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    goRun("whoami.go", strconv.FormatBool(config.RunTasksAsCurrentUser)),
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

func TestPrivilegedGenericWorkerBinaryFailsWorker(t *testing.T) {
	setup(t)

	if config.RunTasksAsCurrentUser {
		t.Skip("Skipping since we're testing if the generic-worker binary is executable by the task user.")
	}

	goPath, err := host.CombinedOutput("go", "env", "GOPATH")
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

	execute(t, INTERNAL_ERROR)
}
