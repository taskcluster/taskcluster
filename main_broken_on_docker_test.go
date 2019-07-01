// +build !docker

package main

import (
	"io/ioutil"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/slugid-go/slugid"
)

func TestAbortAfterMaxRunTime(t *testing.T) {
	defer setup(t)()

	// include a writable directory cache where our process writes to, to make
	// sure we are still able unmount cache when we abort process prematurely
	// that is writing to the cache
	mounts := []MountEntry{
		// requires scope "generic-worker:cache:banana-cache"
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("bananas"),
		},
	}

	payload := GenericWorkerPayload{
		Mounts: toMountArray(t, &mounts),
		Command: append(
			logOncePerSecond(33, filepath.Join("bananas", "banana.log")),
			// also make sure subsequent commands after abort don't run
			helloGoodbye()...,
		),
		MaxRunTime: 5,
	}
	td := testTask(t)
	td.Scopes = []string{"generic-worker:cache:banana-cache"}

	taskID := scheduleTask(t, td, payload)
	startTime := time.Now()
	ensureResolution(t, taskID, "failed", "failed")
	endTime := time.Now()
	// check uploaded log mentions abortion
	// note: we do this rather than local log, to check also log got uploaded
	// as failure path requires that task is resolved before logs are uploaded
	url, err := testQueue.GetLatestArtifact_SignedURL(taskID, "public/logs/live_backing.log", 10*time.Minute)
	if err != nil {
		t.Fatalf("Cannot retrieve url for live_backing.log: %v", err)
	}
	resp, _, err := httpbackoff.Get(url.String())
	if err != nil {
		t.Fatalf("Could not download log: %v", err)
	}
	defer resp.Body.Close()
	bytes, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Error when trying to read log file over http: %v", err)
	}
	logtext := string(bytes)
	if !strings.Contains(logtext, "max run time exceeded") {
		t.Log("Was expecting log file to mention task abortion, but it doesn't:")
		t.Fatal(logtext)
	}
	if strings.Contains(logtext, "hello") {
		t.Log("Task should have been aborted before 'hello' was logged, but log contains 'hello':")
		t.Fatal(logtext)
	}
	duration := endTime.Sub(startTime).Seconds()
	if duration < 5 {
		t.Fatalf("Task %v should have taken at least 5 seconds, but took %v seconds", taskID, duration)
	}
	if duration > 25 {
		t.Fatalf("Task %v should have taken no more than 25 seconds, but took %v seconds", taskID, duration)
	}
}

// If a task tries to execute a command that doesn't exist, it should result in
// a task failure, rather than a task exception, since the task is at fault,
// not the worker.
//
// See https://bugzil.la/1479415
func TestNonExistentCommandFailsTask(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    singleCommandNoArgs(slugid.Nice()),
		MaxRunTime: 10,
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}
