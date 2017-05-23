package main

import (
	"io/ioutil"
	"strings"
	"testing"
	"time"

	"github.com/taskcluster/httpbackoff"
)

// Test failure should resolve as "failed"
func TestFailureResolvesAsFailure(t *testing.T) {
	setup(t)
	payload := GenericWorkerPayload{
		Command:    failCommand(),
		MaxRunTime: 10,
	}
	td := testTask()
	taskID, myQueue := submitTask(t, td, payload)
	RunUntilTasksComplete()

	tsr, err := myQueue.Status(taskID)
	if err != nil {
		t.Fatalf("Could not retrieve task status")
	}
	if tsr.Status.State != "failed" {
		t.Fatalf("Was expecting state %q but got %q", "failed", tsr.Status.State)
	}
}

func TestAbortAfterMaxRunTime(t *testing.T) {
	setup(t)
	payload := GenericWorkerPayload{
		Command:    sleep(4),
		MaxRunTime: 3,
	}
	td := testTask()
	taskID, myQueue := submitTask(t, td, payload)
	RunUntilTasksComplete()

	tsr, err := myQueue.Status(taskID)
	if err != nil {
		t.Fatalf("Could not retrieve task status")
	}
	if tsr.Status.State != "failed" {
		t.Fatalf("Was expecting state %q but got %q", "failed", tsr.Status.State)
	}
	// check uploaded log mentions abortion
	// note: we do this rather than local log, to check also log got uploaded
	// as failure path requires that task is resolved before logs are uploaded
	url, err := myQueue.GetLatestArtifact_SignedURL(taskID, "public/logs/live_backing.log", 10*time.Minute)
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
		t.Fatalf("Was expecting log file to mention task abortion, but it doesn't")
	}
}

func TestIdleWithoutCrash(t *testing.T) {
	setup(t)
	if config.ClientID == "" || config.AccessToken == "" {
		t.Skip("Skipping test since TASKCLUSTER_CLIENT_ID and/or TASKCLUSTER_ACCESS_TOKEN env vars not set")
	}
	start := time.Now()
	config.IdleTimeoutSecs = 7
	exitCode := RunWorker()
	end := time.Now()
	if exitCode != IDLE_TIMEOUT {
		t.Fatalf("Was expecting exit code %v, but got exit code %v", IDLE_TIMEOUT, exitCode)
	}
	if secsAlive := end.Sub(start).Seconds(); secsAlive < 7 {
		t.Fatalf("Worker died early - lasted for %v seconds", secsAlive)
	}
}
