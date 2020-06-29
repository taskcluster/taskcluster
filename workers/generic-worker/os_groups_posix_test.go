// +build darwin linux freebsd

package main

import (
	"strings"
	"testing"
)

func TestEmptyOSGroups(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		OSGroups:   []string{},
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

func TestNonEmptyOSGroups(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		OSGroups:   []string{"abc"},
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, "- osGroups: Array must have at most 0 items") {
		t.Fatalf("Was expecting log file to contain '- osGroups: Array must have at most 0 items' but it doesn't")
	}
}
