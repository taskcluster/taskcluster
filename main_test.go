package main

import (
	"encoding/json"
	"io/ioutil"
	"path/filepath"
	"strings"
	"testing"

	"github.com/taskcluster/taskcluster-client-go/queue"
)

// Badly formatted json payload should result in *json.SyntaxError error in task.validatePayload()
func TestBadPayloadValidate(t *testing.T) {

	badPayload := json.RawMessage(`bad payload, not even json`)
	task := TaskRun{Definition: queue.TaskDefinitionResponse{Payload: badPayload}}
	err := task.validatePayload()
	if err == nil {
		t.Fatalf("Bad task payload should not have passed validation")
	}
	if err.Reason != "malformed-payload" || err.TaskStatus != Errored {
		t.Errorf("Bad task payload should have retured malformed-payload, but actually returned:\n%#v", err)
	}
}

// Test failure should resolve as "failed"
func TestFailureResolvesAsFailure(t *testing.T) {
	setup(t)
	payload := GenericWorkerPayload{
		Command:    failCommand(),
		MaxRunTime: 10,
	}
	td := testTask()
	taskID, myQueue := submitTask(t, td, payload)
	runWorker()

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
		Command:    sleep(2),
		MaxRunTime: 1,
	}
	td := testTask()
	taskID, myQueue := submitTask(t, td, payload)
	runWorker()

	tsr, err := myQueue.Status(taskID)
	if err != nil {
		t.Fatalf("Could not retrieve task status")
	}
	if tsr.Status.State != "failed" {
		t.Fatalf("Was expecting state %q but got %q", "failed", tsr.Status.State)
	}
	// check log mentions abortion
	bytes, err := ioutil.ReadFile(filepath.Join("testdata/public/logs/live_backing.log"))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	logtext := string(bytes)
	if !strings.Contains(logtext, "max run time exceeded") {
		t.Fatalf("Was expecting log file to mention task abortion, but it doesn't")
	}
}
