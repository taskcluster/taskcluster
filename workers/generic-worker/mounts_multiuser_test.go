//go:build multiuser

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/fileutil"
)

// grantingDenying returns regexp strings that match the log lines for granting
// and denying a task user access to a file/folder (specified by taskPath).
// filetype should be 'directory' or 'file'.
func grantingDenying(t *testing.T, filetype string, cacheFile bool, taskPath ...string) (granting, denying []string) {
	t.Helper()
	// We need to escape file path that is contained in final regexp, e.g. due
	// to '\' path separator on Windows. However, the path also includes an
	// unknown task user (task_[0-9]*) which we don't want to escape. The
	// simplest way to properly escape the expression but without escaping this
	// one part of it, is to swap out the task user expression with a randomly
	// generated slugid (122 bits of randomness) which doesn't contain
	// characters that need escaping, then to escape the full expression, and
	// finally to replace the swapped in slug with the desired regexp that we
	// couldn't include before escaping.
	var pathRegExp string
	if cacheFile {
		pathRegExp = ".*"
	} else {
		slug := slugid.V4()
		pathRegExp = strings.ReplaceAll(regexp.QuoteMeta(filepath.Join(testdataDir, t.Name(), "tasks", slug, filepath.Join(taskPath...))), slug, "task_[0-9]*")
	}
	return []string{
			`Granting task_[0-9]* full control of ` + filetype + ` '` + pathRegExp + `'`,
		}, []string{
			`Denying task_[0-9]* access to '.*'`,
		}
}

func updateOwnership(t *testing.T) []string {
	t.Helper()
	return []string{
		"Updating ownership of files inside directory '.*" + t.Name() + "' from .* to task_[0-9]*",
	}
}

func TestTaskUserCannotMountInPrivilegedLocation(t *testing.T) {
	setup(t)

	dir, err := os.MkdirTemp(testTaskDir(), t.Name())
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
	if runtime.GOOS == "windows" {
		_ = submitAndAssert(t, td, payload, "failed", "failed")
	} else {
		_ = submitAndAssert(t, td, payload, "completed", "completed")
	}
}
