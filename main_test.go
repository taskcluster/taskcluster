package main

import (
	"bytes"
	"fmt"
	"io/ioutil"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/taskcluster/httpbackoff"
)

// Test failure should resolve as "failed"
func TestFailureResolvesAsFailure(t *testing.T) {
	defer setup(t, "TestFailureResolvesAsFailure")()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(1),
		MaxRunTime: 10,
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

// Exit codes specified in OnExitCode should resolve as itermittent
func TestFailureRetryCode(t *testing.T) {
	defer setup(t, "TestFailureRetryCode")()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(123),
		MaxRunTime: 10,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{123},
		},
	}
	td := testTask(t)

	fmt.Print(td)

	_ = submitAndAssert(t, td, payload, "exception", "intermittent-task")
}

// Exit codes _not_ specified in OnExitCode should resolve normally
func TestFailureRetryCodeNormal(t *testing.T) {
	defer setup(t, "TestFailureRetryCodeNormal")()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(456),
		MaxRunTime: 10,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{123},
		},
	}
	td := testTask(t)

	fmt.Print(td)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

// Exit codes should not override success
func TestFailureRetryCodeSuccess(t *testing.T) {
	defer setup(t, "TestFailureRetryCodeSuccess")()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 10,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{780},
		},
	}
	td := testTask(t)

	fmt.Print(td)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

// Exit codes as a list
func TestFailureRetryCodeList(t *testing.T) {
	defer setup(t, "TestFailureRetryCodeList")()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(10),
		MaxRunTime: 10,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{780, 10, 2},
		},
	}
	td := testTask(t)

	fmt.Print(td)

	_ = submitAndAssert(t, td, payload, "exception", "intermittent-task")
}

// Exit codes with empty list are fine
func TestFailureRetryCodeEmpty(t *testing.T) {
	defer setup(t, "TestFailureRetryCodeEmpty")()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 10,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{},
		},
	}
	td := testTask(t)

	fmt.Print(td)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

// Exit codes with empty list are fine (failure)
func TestFailureRetryCodeEmptyFail(t *testing.T) {
	defer setup(t, "TestFailureRetryCodeEmptyFail")()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(1),
		MaxRunTime: 10,
		OnExitStatus: ExitCodeHandling{
			Retry: []int64{},
		},
	}
	td := testTask(t)

	fmt.Print(td)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

func TestAbortAfterMaxRunTime(t *testing.T) {
	defer setup(t, "TestAbortAfterMaxRunTime")()

	// include a writable directory cache where our process writes to, to make
	// sure we are still able unmount cache when we abort process prematurely
	// that is writing to the cache
	mounts := []MountEntry{
		// requires scope "generic-worker:cache:banana-cache"
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("bananas"),
		},
	}

	payload := GenericWorkerPayload{
		Mounts: toMountArray(t, &mounts),
		Command: append(
			logOncePerSecond(27, filepath.Join("bananas", "banana.log")),
			// also make sure subsequent commands after abort don't run
			helloGoodbye()...,
		),
		MaxRunTime: 5,
	}
	td := testTask(t)
	td.Scopes = []string{"generic-worker:cache:banana-cache"}

	taskID := scheduleTask(t, td, payload)
	startTime := time.Now()
	ensureResolution(t, taskID, "failed", "failed")
	endTime := time.Now()
	// check uploaded log mentions abortion
	// note: we do this rather than local log, to check also log got uploaded
	// as failure path requires that task is resolved before logs are uploaded
	url, err := testQueue.GetLatestArtifact_SignedURL(taskID, "public/logs/live_backing.log", 10*time.Minute)
	if err != nil {
		t.Fatalf("Cannot retrieve url for live_backing.log: %v", err)
	}
	resp, _, err := httpbackoff.Get(url.String())
	if err != nil {
		t.Fatalf("Could not download log: %v", err)
	}
	defer resp.Body.Close()
	bytes, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Error when trying to read log file over http: %v", err)
	}
	logtext := string(bytes)
	if !strings.Contains(logtext, "max run time exceeded") {
		t.Log("Was expecting log file to mention task abortion, but it doesn't:")
		t.Fatal(logtext)
	}
	if strings.Contains(logtext, "hello") {
		t.Log("Task should have been aborted before 'hello' was logged, but log contains 'hello':")
		t.Fatal(logtext)
	}
	duration := endTime.Sub(startTime).Seconds()
	if duration < 5 {
		t.Fatalf("Task %v should have taken at least 5 seconds, but took %v seconds", taskID, duration)
	}
	if duration > 20 {
		t.Fatalf("Task %v should have taken no more than 20 seconds, but took %v seconds", taskID, duration)
	}
}

func TestIdleWithoutCrash(t *testing.T) {
	defer setup(t, "TestIdleWithoutCrash")()
	if config.ClientID == "" || config.AccessToken == "" {
		t.Skip("Skipping test since TASKCLUSTER_CLIENT_ID and/or TASKCLUSTER_ACCESS_TOKEN env vars not set")
	}
	start := time.Now()
	config.IdleTimeoutSecs = 7
	exitCode := RunWorker()
	end := time.Now()
	if exitCode != IDLE_TIMEOUT {
		t.Fatalf("Was expecting exit code %v, but got exit code %v", IDLE_TIMEOUT, exitCode)
	}
	// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
	if secsAlive := end.Round(0).Sub(start).Seconds(); secsAlive < 7 {
		t.Fatalf("Worker died early - lasted for %v seconds", secsAlive)
	}
}

func TestRevisionNumberStored(t *testing.T) {
	if !regexp.MustCompile("^[0-9a-f]{40}$").MatchString(revision) {
		t.Fatalf("Git revision could not be determined - got '%v' but expected to match regular expression '^[0-9a-f](40)$'\n"+
			"Did you specify `-ldflags \"-X github.com/taskcluster/generic-worker.revision=<GIT REVISION>\"` in your go test command?\n"+
			"Try using build.sh / build.cmd in root directory of generic-worker source code repository.", revision)
	}
	t.Logf("Git revision successfully retrieved: %v", revision)
}

// TestLogFormat tests the formatting of the various logging methods as
// required by treeherder log parsing.
func TestLogFormat(t *testing.T) {
	type LogFormatTest struct {
		LogCall      func(task *TaskRun)
		ResultFormat string
	}
	testCases := []LogFormatTest{
		LogFormatTest{
			LogCall: func(task *TaskRun) {
				task.Info("Another day for you and me in paradise")
			},
			ResultFormat: `^\[taskcluster 20\d{2}-[01]\d-[0123]\dT[012]\d:[012345]\d:[012345]\d\.\d{3}Z\] Another day for you and me in paradise` + "\n$",
		},
		LogFormatTest{
			LogCall: func(task *TaskRun) {
				task.Warn("I believe in a thing called love")
			},
			ResultFormat: `^\[taskcluster:warn 20\d{2}-[01]\d-[0123]\dT[012]\d:[012345]\d:[012345]\d\.\d{3}Z\] I believe in a thing called love` + "\n$",
		},
		LogFormatTest{
			LogCall: func(task *TaskRun) {
				task.Error("Well lawdy, lawdy, lawdy Miss Clawdy")
			},
			ResultFormat: `^\[taskcluster:error\] Well lawdy, lawdy, lawdy Miss Clawdy` + "\n$",
		},
		LogFormatTest{
			LogCall: func(task *TaskRun) {
				task.Infof("It only takes a minute %v", "girl")
			},
			ResultFormat: `^\[taskcluster 20\d{2}-[01]\d-[0123]\dT[012]\d:[012345]\d:[012345]\d\.\d{3}Z\] It only takes a minute girl` + "\n$",
		},
		LogFormatTest{
			LogCall: func(task *TaskRun) {
				task.Warnf("When you %v %v best, but you don't succeed", "try", "your")
			},
			ResultFormat: `^\[taskcluster:warn 20\d{2}-[01]\d-[0123]\dT[012]\d:[012345]\d:[012345]\d\.\d{3}Z\] When you try your best, but you don't succeed` + "\n$",
		},
		LogFormatTest{
			LogCall: func(task *TaskRun) {
				task.Errorf("Thought I saw a man %v to life", "brought")
			},
			ResultFormat: `^\[taskcluster:error\] Thought I saw a man brought to life` + "\n$",
		},
	}
	for _, test := range testCases {
		logWriter := new(bytes.Buffer)
		task := &TaskRun{
			logWriter: logWriter,
		}
		test.LogCall(task)
		{
			task.logMux.RLock()
			defer task.logMux.RUnlock()
			if !regexp.MustCompile(test.ResultFormat).MatchString(logWriter.String()) {
				t.Fatalf("Expected log line '%v' to match regexp '%v' but it didn't.", logWriter.String(), test.ResultFormat)
			}
		}
	}
}

func TestExecutionErrorsText(t *testing.T) {
	errors := ExecutionErrors{
		&CommandExecutionError{
			Cause:      fmt.Errorf("Oh dear oh dear"),
			Reason:     malformedPayload,
			TaskStatus: failed,
		},
		&CommandExecutionError{
			Cause:      fmt.Errorf("This isn't good"),
			Reason:     workerShutdown,
			TaskStatus: aborted,
		},
	}
	expectedError := "Oh dear oh dear\nThis isn't good"
	actualError := errors.Error()
	if expectedError != actualError {
		t.Log("Was expecting error:")
		t.Log(expectedError)
		t.Log("but got:")
		t.Log(actualError)
		t.FailNow()
	}
}
