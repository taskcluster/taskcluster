// +build darwin linux

package main

import (
	"io/ioutil"
	"path/filepath"
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

	// check log mentions issue
	bytes, err := ioutil.ReadFile(filepath.Join(taskContext.TaskDir, logPath))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	logtext := string(bytes)
	if !strings.Contains(logtext, "- osGroups: Array must have at most 0 items") {
		t.Fatalf("Was expecting log file to contain '- osGroups: Array must have at most 0 items' but it doesn't")
	}
}
