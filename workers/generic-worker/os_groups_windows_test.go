package main

import (
	"fmt"
	"strings"
	"testing"
)

func TestMissingScopesOSGroups(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		OSGroups:   []string{"abc", "def"},
	}
	td := testTask(t)

	// don't set any scopes
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, "generic-worker:os-group:"+td.ProvisionerID+"/"+td.WorkerType+"/abc") || !strings.Contains(logtext, "generic-worker:os-group:"+td.ProvisionerID+"/"+td.WorkerType+"/def") {
		t.Fatalf("Was expecting log file to contain missing scopes, but it doesn't")
	}
}

func TestOSGroupsRespected(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		OSGroups:   []string{"abc", "def"},
	}
	td := testTask(t)
	td.Scopes = []string{
		"generic-worker:os-group:" + td.ProvisionerID + "/" + td.WorkerType + "/abc",
		"generic-worker:os-group:" + td.ProvisionerID + "/" + td.WorkerType + "/def",
	}

	if config.RunTasksAsCurrentUser {
		_ = submitAndAssert(t, td, payload, "completed", "completed")

		logtext := LogText(t)
		substring := fmt.Sprintf("Not adding task user to group(s) %v since we are running as current user.", payload.OSGroups)
		if !strings.Contains(logtext, substring) {
			t.Log(logtext)
			t.Fatalf("Was expecting log to contain string: '%v'", substring)
		}
	} else {
		// check task had malformed payload, due to non existent groups
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

		logtext := LogText(t)
		substring := fmt.Sprintf("Could not add task user to os group(s): %v", payload.OSGroups)
		if !strings.Contains(logtext, substring) {
			t.Log(logtext)
			t.Fatalf("Was expecting log to contain string: '%v'", substring)
		}
	}
}
