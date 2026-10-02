//go:build darwin || linux || freebsd

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/mcuadros/go-defaults"
)

// TestMountThroughSymlinkInCache checks that a symlink left in a writable
// cache by one task cannot redirect a later task's mounts outside of its task
// directory.
func TestMountThroughSymlinkInCache(t *testing.T) {
	setup(t)

	// world writable, so that only the worker could stop a write to it
	outside := worldWritableTempDir(t, t.Name())
	scopes := []string{"generic-worker:cache:tc-test-symlink-cache"}
	cache := &WritableDirectoryCache{
		CacheName: "tc-test-symlink-cache",
		Directory: "cache",
	}

	mounts := []MountEntry{cache}
	payload := GenericWorkerPayload{
		Mounts:     toMountArray(t, &mounts),
		Command:    [][]string{{"ln", "-s", outside, filepath.Join("cache", "evil")}},
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = scopes
	_ = submitAndAssert(t, td, payload, "completed", "completed")

	mounts = []MountEntry{
		cache,
		&FileMount{
			File:    filepath.Join("cache", "evil", "x"),
			Content: json.RawMessage(`{"raw": "data"}`),
		},
	}
	payload = GenericWorkerPayload{
		Mounts:     toMountArray(t, &mounts),
		Command:    helloGoodbye(),
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)
	td = testTask(t)
	td.Scopes = scopes
	_ = submitAndAssert(t, td, payload, "failed", "failed")

	entries, err := os.ReadDir(outside)
	if err != nil {
		t.Fatalf("Could not read %v: %v", outside, err)
	}
	if len(entries) != 0 {
		t.Fatalf("Was expecting nothing to be written outside of the task directory to %v, but found %v", outside, entries)
	}
}
