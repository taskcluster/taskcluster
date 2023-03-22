//go:build !docker

package main

import (
	"strings"
	"testing"
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
