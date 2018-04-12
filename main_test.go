package main

import (
	"bytes"
	"io/ioutil"
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
		Command:    failCommand(),
		MaxRunTime: 10,
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

func TestAbortAfterMaxRunTime(t *testing.T) {
	defer setup(t, "TestAbortAfterMaxRunTime")()
	payload := GenericWorkerPayload{
		Command:    sleep(4),
		MaxRunTime: 3,
	}
	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "failed", "failed")
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
		t.Fatalf("Was expecting log file to mention task abortion, but it doesn't")
	}
	// TODO: this is a hack to make sure sleep process has died before we call teardown
	// We need to make sure processes are properly killed when a task is aborted
	time.Sleep(1500 * time.Millisecond)
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
