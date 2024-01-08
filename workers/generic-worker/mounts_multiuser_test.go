//go:build multiuser

package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v60/workers/generic-worker/fileutil"
)

func TestTaskUserCannotMountInPrivilegedLocation(t *testing.T) {
	setup(t)

	if config.RunTasksAsCurrentUser {
		t.Skip("This test is only relevant when running as task user")
	}

	dir, err := os.MkdirTemp(taskContext.TaskDir, t.Name())
	if err != nil {
		t.Fatalf("Failed to create temporary directory: %v", err)
	}
	defer os.RemoveAll(dir)

	err = fileutil.SecureFiles(dir)
	if err != nil {
		t.Fatalf("Failed to secure temporary directory: %v", err)
	}

	mounts := []MountEntry{
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("../../../", filepath.Base(dir)),
		},
	}

	payload := GenericWorkerPayload{
		Mounts:     toMountArray(t, &mounts),
		Command:    helloGoodbye(),
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:cache:banana-cache")

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}
