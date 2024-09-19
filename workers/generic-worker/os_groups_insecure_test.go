//go:build insecure

package main

import (
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
		OSGroups:   []string{"docker"},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}
