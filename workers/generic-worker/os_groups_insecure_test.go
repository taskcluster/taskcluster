//go:build insecure

package main

import (
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestEmptyOSGroups(t *testing.T) {
	setup(t)
	payload := GenericWorkerPayload{
		Command:    listGroups(),
		MaxRunTime: 30,
		OSGroups:   []string{},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

func TestNonEmptyOSGroupsUserIsNotIn(t *testing.T) {
	setup(t)
	payload := GenericWorkerPayload{
		Command:    listGroups(),
		MaxRunTime: 30,
		OSGroups:   []string{"abc"},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	td.Scopes = []string{}
	// grant all required scopes
	for _, group := range payload.OSGroups {
		td.Scopes = append(td.Scopes, "generic-worker:os-group:"+td.ProvisionerID+"/"+td.WorkerType+"/"+group)
	}

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, "task payload contains unsupported osGroups:") {
		t.Fatalf("Was expecting log file to contain 'task payload contains unsupported osGroups:'")
	}
}
