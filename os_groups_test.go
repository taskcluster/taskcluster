package main

import (
	"fmt"
	"io/ioutil"
	"path/filepath"
	"strings"
	"testing"
)

func TestMissingScopesOSGroups(t *testing.T) {
	setup(t)
	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 1,
		OSGroups:   []string{"abc", "def"},
	}
	td := testTask()
	// don't set any scopes
	taskID, myQueue := submitTask(t, td, payload)
	runWorker()

	// check task had exception/malformed-payload
	tsr, err := myQueue.Status(taskID)
	if err != nil {
		t.Fatalf("Problem querying status of task %v: %v", taskID, err)
	}
	if tsr.Status.State != "exception" || tsr.Status.Runs[0].ReasonResolved != "malformed-payload" {
		t.Fatalf("Task %v did not complete as intended - it resolved as %v/%v but should have resolved as exception/malformed-payload", taskID, tsr.Status.State, tsr.Status.Runs[0].ReasonResolved)
	}

	// check log mentions both missing scopes
	bytes, err := ioutil.ReadFile(filepath.Join("testdata/public/logs/live_backing.log"))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	logtext := string(bytes)
	if !strings.Contains(logtext, "generic-worker:os-group:abc") || !strings.Contains(logtext, "generic-worker:os-group:def") {
		t.Fatalf("Was expecting log file to contain missing scopes, but it doesn't")
	}
}

func TestOSGroupsRespected(t *testing.T) {
	setup(t)
	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		OSGroups:   []string{"abc", "def"},
	}
	td := testTask()
	td.Scopes = []string{"generic-worker:os-group:abc", "generic-worker:os-group:def"}
	taskID, myQueue := submitTask(t, td, payload)
	runWorker()

	// check task resolved successfully
	tsr, err := myQueue.Status(taskID)
	if err != nil {
		t.Fatalf("Problem querying status of task %v: %v", taskID, err)
	}
	if tsr.Status.State != "completed" {
		t.Fatalf("Task %v resolved as %v/%v but should have resolved as completed", taskID, tsr.Status.State, tsr.Status.Runs[0].ReasonResolved)
	}

	// check log mentions both missing scopes
	bytes, err := ioutil.ReadFile(filepath.Join("testdata/public/logs/live_backing.log"))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	logtext := string(bytes)
	substring := fmt.Sprintf("Not adding user to groups %v since we are running as current user.", payload.OSGroups)
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v", substring)
	}
}
