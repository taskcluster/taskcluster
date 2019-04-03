// +build !dockerEngine

package main

import (
	"path/filepath"
	"testing"
	"time"
)

// Makes sure that if a running task gets cancelled externally, the worker does not shut down
func TestResolveResolvedTask(t *testing.T) {
	defer setup(t)()
	td, payload := cancelTask(t)
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

	td, payload := cancelTask(t)
	td.Scopes = []string{"generic-worker:cache:banana-cache"}
	payload.Command = append(payload.Command, sleep(30)...)
	payload.Mounts = toMountArray(t, &mounts)
	reclaimEvery5Seconds = true
	start := time.Now()
	taskID := submitAndAssert(t, td, payload, "exception", "canceled")
	end := time.Now()
	reclaimEvery5Seconds = false

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

	if duration := end.Sub(start); duration.Seconds() > 60 {
		t.Fatalf("Task should have expired in around five seconds, but took %v", duration)
	}
}
