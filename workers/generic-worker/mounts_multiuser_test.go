//go:build multiuser

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v68/workers/generic-worker/fileutil"
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

// Test for upstream issue https://github.com/mholt/archiver/issues/152
func TestHardLinksInArchive(t *testing.T) {
	setup(t)

	mounts := []MountEntry{
		// requires scope "generic-worker:cache:banana-cache"
		&ReadOnlyDirectory{
			Directory: filepath.Join("tools", "git"),
			Content: json.RawMessage(`{
				"url":   "https://github.com/git-for-windows/git/releases/download/v2.11.0.windows.3/Git-2.11.0.3-32-bit.tar.bz2",
				"sha256": "0f0e2f78fc9b91d6c860eb7de742f3601b0ccd13c5c61444c7cf55b00bcb4ed4"
			}`),
			Format: "tar.bz2",
		},
	}

	payload := GenericWorkerPayload{
		Mounts:     toMountArray(t, &mounts),
		Command:    helloGoodbye(),
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)

	// task users on windows do not have permission to create hard links
	// they are missing the SeCreateSymbolicLinkPrivilege privilege
	if runtime.GOOS == "windows" && !config.RunTasksAsCurrentUser {
		_ = submitAndAssert(t, td, payload, "failed", "failed")
	} else {
		_ = submitAndAssert(t, td, payload, "completed", "completed")
	}
}
