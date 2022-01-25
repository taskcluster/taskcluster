//go:build !docker
// +build !docker

package main

import (
	"path/filepath"
	"testing"
	"time"
)

// Makes sure that if a running task gets cancelled externally, the worker does not shut down
func TestResolveResolvedTask(t *testing.T) {
	defer setup(t)()
	td, payload := CancelTask(t)
	_ = submitAndAssert(t, td, payload, "exception", "canceled")
}

func TestReclaimCancelledTask(t *testing.T) {
	defer setup(t)()
	mounts := []MountEntry{
		// requires scope "generic-worker:cache:banana-cache"
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("my-task-caches", "bananas"),
		},
	}

	td, payload := CancelTask(t)
	td.Scopes = []string{"generic-worker:cache:banana-cache"}
	payload.Command = append(payload.Command, sleep(300)...)
	payload.Mounts = toMountArray(t, &mounts)
	reclaimEvery5Seconds = true
	defer func() {
		reclaimEvery5Seconds = false
	}()
	start := time.Now()
	taskID := submitAndAssert(t, td, payload, "exception", "canceled")
	end := time.Now()

	expectedArtifacts := ExpectedArtifacts{
		"public/logs/live_backing.log": {
			Extracts: []string{
				"Preserving cache: Moving",
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
			Expires:         td.Expires,
		},
	}

	expectedArtifacts.Validate(t, taskID, 0)

	if duration := end.Sub(start); duration.Seconds() > 280 {
		t.Fatalf("Task should have expired long before the max run time (300s) but took %v", duration)
	}
}
