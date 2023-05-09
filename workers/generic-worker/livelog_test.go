package main

import (
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestCustomLogPaths(t *testing.T) {
	setup(t)

	customLiveLogName := "public/banana.log"
	customBackingLogName := "public/banana_backing.log"

	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		Logs: Logs{
			Backing: customBackingLogName,
			Live:    customLiveLogName,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	bytes := getArtifactContent(t, taskID, customBackingLogName)
	logtext := string(bytes)
	if !strings.Contains(logtext, "goodbye world!") {
		t.Fatalf("Was expecting backing log file to contain 'goodbye world!' but it doesn't")
	}

	bytes = getArtifactContent(t, taskID, customLiveLogName)
	logtext = string(bytes)
	if !strings.Contains(logtext, "hello world!") {
		t.Fatalf("Was expecting live log file to contain 'hello world!' but it doesn't")
	}
}

func TestDisableLiveLogFeature(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
	}
	defaults.SetDefaults(&payload)

	// this has to be set _after_ setting defaults, since we are explicitly setting to the zero value!
	payload.Features.LiveLog = false

	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	// some required substrings - not all, just a selection
	expectedArtifacts := ExpectedArtifacts{
		"public/logs/live_backing.log": {
			Extracts: []string{
				"hello world!",
				"goodbye world!",
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
			Expires:         td.Expires,
		},
	}
	expectedArtifacts.Validate(t, taskID, 0)
}
