package main

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
)

// Exit codes specified in OnExitStatus.PurgeCaches should purge caches
func TestPurgeCaches(t *testing.T) {
	setup(t)
	mounts := []MountEntry{
		// requires scope "generic-worker:cache:banana-cache"
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("my-task-caches", "bananas"),
		},
	}
	payload := GenericWorkerPayload{
		Command:    returnExitCode(123),
		MaxRunTime: 30,
		Mounts:     toMountArray(t, mounts),
		OnExitStatus: ExitCodeHandling{
			PurgeCaches: []int64{123},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = []string{"generic-worker:cache:banana-cache"}

	_ = submitAndAssert(t, td, payload, "failed", "failed")

	logtext := LogText(t)
	substring := "[mounts] Removing cache banana-cache from cache table"
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v.", substring)
	}

	substring = "[mounts] Deleting cache banana-cache file(s) at"
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v.", substring)
	}

	// WritableDirectoryCache should not be unmounted and moved to the cache dir
	substring = "[mounts] Preserving cache: Copying"
	if strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was not expecting log to contain string %v.", substring)
	}

	ensureDirContainsNFiles(t, cachesDir, 0)
}

// Exit codes _not_ specified in OnExitStatus.PurgeCaches should resolve normally
func TestPurgeCachesCommandFailure(t *testing.T) {
	setup(t)
	mounts := []MountEntry{
		// requires scope "generic-worker:cache:banana-cache"
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("my-task-caches", "bananas"),
		},
	}
	payload := GenericWorkerPayload{
		Command:    returnExitCode(456),
		MaxRunTime: 30,
		Mounts:     toMountArray(t, mounts),
		OnExitStatus: ExitCodeHandling{
			PurgeCaches: []int64{123},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = []string{"generic-worker:cache:banana-cache"}

	_ = submitAndAssert(t, td, payload, "failed", "failed")

	logtext := LogText(t)
	// WritableDirectoryCache should be unmounted and moved to the cache dir
	substring := "[mounts] Preserving cache: Copying"
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v.", substring)
	}

	ensureDirContainsNFiles(t, cachesDir, 1)
}

// Exit codes should not override success
func TestPurgeCachesCommandSuccess(t *testing.T) {
	setup(t)
	mounts := []MountEntry{
		// requires scope "generic-worker:cache:banana-cache"
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("my-task-caches", "bananas"),
		},
	}
	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 30,
		Mounts:     toMountArray(t, mounts),
		OnExitStatus: ExitCodeHandling{
			PurgeCaches: []int64{780},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = []string{"generic-worker:cache:banana-cache"}

	_ = submitAndAssert(t, td, payload, "completed", "completed")

	logtext := LogText(t)
	// WritableDirectoryCache should be unmounted and moved to the cache dir
	substring := "[mounts] Preserving cache: Copying"
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v.", substring)
	}

	ensureDirContainsNFiles(t, cachesDir, 1)
}

// Exit codes as a list
func TestPurgeCachesListCommand(t *testing.T) {
	setup(t)
	mounts := []MountEntry{
		// requires scope "generic-worker:cache:banana-cache"
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("my-task-caches", "bananas"),
		},
	}
	payload := GenericWorkerPayload{
		Command:    returnExitCode(10),
		MaxRunTime: 30,
		Mounts:     toMountArray(t, mounts),
		OnExitStatus: ExitCodeHandling{
			PurgeCaches: []int64{780, 10, 2},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = []string{"generic-worker:cache:banana-cache"}

	_ = submitAndAssert(t, td, payload, "failed", "failed")

	logtext := LogText(t)
	substring := "[mounts] Removing cache banana-cache from cache table"
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v.", substring)
	}

	substring = "[mounts] Deleting cache banana-cache file(s) at"
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v.", substring)
	}

	// WritableDirectoryCache should not be unmounted and moved to the cache dir
	substring = "[mounts] Preserving cache: Copying"
	if strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was not expecting log to contain string %v.", substring)
	}

	ensureDirContainsNFiles(t, cachesDir, 0)
}

// Exit codes with empty list are fine
func TestPurgeCachesEmptyListCommandSuccess(t *testing.T) {
	setup(t)
	mounts := []MountEntry{
		// requires scope "generic-worker:cache:banana-cache"
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("my-task-caches", "bananas"),
		},
	}
	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 30,
		Mounts:     toMountArray(t, mounts),
		OnExitStatus: ExitCodeHandling{
			PurgeCaches: []int64{},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = []string{"generic-worker:cache:banana-cache"}

	_ = submitAndAssert(t, td, payload, "completed", "completed")

	logtext := LogText(t)
	// WritableDirectoryCache should be unmounted and moved to the cache dir
	substring := "[mounts] Preserving cache: Copying"
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v.", substring)
	}

	ensureDirContainsNFiles(t, cachesDir, 1)
}

// Exit codes with empty list are fine (failure)
func TestPurgeCachesEmptyListCommandFailure(t *testing.T) {
	setup(t)
	mounts := []MountEntry{
		// requires scope "generic-worker:cache:banana-cache"
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("my-task-caches", "bananas"),
		},
	}
	payload := GenericWorkerPayload{
		Command:    returnExitCode(1),
		MaxRunTime: 30,
		Mounts:     toMountArray(t, mounts),
		OnExitStatus: ExitCodeHandling{
			PurgeCaches: []int64{},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = []string{"generic-worker:cache:banana-cache"}

	_ = submitAndAssert(t, td, payload, "failed", "failed")

	logtext := LogText(t)
	// WritableDirectoryCache should be unmounted and moved to the cache dir
	substring := "[mounts] Preserving cache: Copying"
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v.", substring)
	}

	ensureDirContainsNFiles(t, cachesDir, 1)
}

// Not allowed to specify negative exit code
func TestPurgeCachesNegativeExitCode(t *testing.T) {
	setup(t)
	mounts := []MountEntry{
		// requires scope "generic-worker:cache:banana-cache"
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("my-task-caches", "bananas"),
		},
	}
	payload := GenericWorkerPayload{
		Command:    returnExitCode(1),
		MaxRunTime: 30,
		Mounts:     toMountArray(t, mounts),
		OnExitStatus: ExitCodeHandling{
			PurgeCaches: []int64{-1},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = []string{"generic-worker:cache:banana-cache"}

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	logtext := LogText(t)
	substring := "onExitStatus.purgeCaches.0: Must be greater than or equal to 0"
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v.", substring)
	}
}

// Exit codes specified in OnExitStatus.PurgeCaches should only purge task caches
func TestPurgeTaskCaches(t *testing.T) {
	setup(t)
	mounts := []MountEntry{
		// requires scope "generic-worker:cache:apple-cache"
		&WritableDirectoryCache{
			CacheName: "apple-cache",
			Directory: filepath.Join("my-task-caches", "apples"),
		},
	}
	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 30,
		Mounts:     toMountArray(t, mounts),
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = []string{"generic-worker:cache:apple-cache"}

	_ = submitAndAssert(t, td, payload, "completed", "completed")

	ensureDirContainsNFiles(t, cachesDir, 1)

	mounts = []MountEntry{
		// requires scope "generic-worker:cache:banana-cache"
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("my-task-caches", "bananas"),
		},
	}
	payload = GenericWorkerPayload{
		Command:    returnExitCode(123),
		MaxRunTime: 30,
		Mounts:     toMountArray(t, mounts),
		OnExitStatus: ExitCodeHandling{
			PurgeCaches: []int64{123},
		},
	}
	defaults.SetDefaults(&payload)
	td = testTask(t)
	td.Scopes = []string{"generic-worker:cache:banana-cache"}

	_ = submitAndAssert(t, td, payload, "failed", "failed")

	logtext := LogText(t)
	substring := "[mounts] Removing cache banana-cache from cache table"
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v.", substring)
	}

	substring = "[mounts] Deleting cache banana-cache file(s) at"
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v.", substring)
	}

	// WritableDirectoryCache should not be unmounted and moved to the cache dir
	substring = "[mounts] Preserving cache: Copying"
	if strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was not expecting log to contain string %v.", substring)
	}

	// ensure task cache from previous task is still present
	ensureDirContainsNFiles(t, cachesDir, 1)
}
