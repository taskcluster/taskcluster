//go:build insecure

package main

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/mcuadros/go-defaults"
)

func grantingDenying(t *testing.T, filetype string, cacheFile bool, taskPath ...string) (granting, denying []string) {
	t.Helper()
	return []string{}, []string{}
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

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}
