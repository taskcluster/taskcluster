package main

import (
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestAllowPtrace(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 10,
		Features: FeatureFlags{
			AllowPtrace: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:feature:allowPtrace")

	_ = submitAndAssert(t, td, payload, "completed", "completed")

	t.Log(LogText(t))
}

func TestIncorrectAllowPtraceScopes(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 10,
		Features: FeatureFlags{
			AllowPtrace: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	// don't set any scopes
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, "generic-worker:feature:allowPtrace") {
		t.Fatal("Expected log file to contain missing scopes, but it didn't")
	}

	t.Log(logtext)
}
