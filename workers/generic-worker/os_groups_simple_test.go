//go:build simple

package main

import (
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestEmptyOSGroups(t *testing.T) {
	setup(t)
	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		OSGroups:   []string{},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

func TestNonEmptyOSGroups(t *testing.T) {
	setup(t)
	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		OSGroups:   []string{"abc"},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, "- osGroups: Array must have at most 0 items") {
		t.Fatalf("Was expecting log file to contain '- osGroups: Array must have at most 0 items' but it doesn't")
	}
}
