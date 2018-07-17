package main

import (
	"io/ioutil"
	"path/filepath"
	"strings"
	"testing"
)

// Exit codes specified in OnExitStatus should resolve as itermittent
func TestIntermittentCodeCommandIntermittent(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(123),
		MaxRunTime: 30,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{123},
		},
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "intermittent-task")
	// Note this will cause the queue to schedule a new task run that won't get
	// claimed - but let's not waste resources by claiming it, and leave it to
	// exceed deadline.
}

// Exit codes _not_ specified in OnExitStatus should resolve normally
func TestIntermittentCodeCommandFailure(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(456),
		MaxRunTime: 30,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{123},
		},
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

// Exit codes should not override success
func TestIntermittentCodeCommandSuccess(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 30,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{780},
		},
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

// Exit codes as a list
func TestIntermittentListCommandIntermittent(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(10),
		MaxRunTime: 30,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{780, 10, 2},
		},
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "intermittent-task")
	// Note this will cause the queue to schedule a new task run that won't get
	// claimed - but let's not waste resources by claiming it, and leave it to
	// exceed deadline.
}

// Exit codes with empty list are fine
func TestIntermittentEmptyListCommandSuccess(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 30,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{},
		},
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

// Exit codes with empty list are fine (failure)
func TestIntermittentEmptyListCommandFailure(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(1),
		MaxRunTime: 30,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{},
		},
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

// Not allowed to specify negative exit code
func TestIntermittentNegativeExitCode(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(1),
		MaxRunTime: 30,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{-1},
		},
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	bytes, err := ioutil.ReadFile(filepath.Join(taskContext.TaskDir, logPath))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	logtext := string(bytes)
	substring := "onExitStatus.retry.0: Must be greater than or equal to 1"
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string %v.", substring)
	}
}
