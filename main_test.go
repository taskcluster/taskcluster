package main

import (
	"bytes"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

// Test failure should resolve as "failed"
func TestFailureResolvesAsFailure(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command:    returnExitCode(1),
		MaxRunTime: 10,
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

func TestIdleWithoutCrash(t *testing.T) {
	defer setup(t)()
	if config.ClientID == "" || config.AccessToken == "" || config.RootURL == "" {
		t.Skip("Skipping test since TASKCLUSTER_{CLIENT_ID,ACCESS_TOKEN,ROOT_URL} env vars not set")
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

// If a task tries to execute a file that isn't executable for the current
// user, it should result in a task failure, rather than a task exception,
// since the task is at fault, not the worker.
//
// See https://bugzil.la/1479415
func TestNonExecutableBinaryFailsTask(t *testing.T) {
	defer setup(t)()
	commands := copyTestdataFile("ed25519_public_key")
	commands = append(commands, singleCommandNoArgs(filepath.Join(taskContext.TaskDir, "ed25519_public_key"))...)
	payload := GenericWorkerPayload{
		Command:    commands,
		MaxRunTime: 10,
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

// TestRemoveTaskDirs creates a temp directory containing files and folders
// whose names begin with 'task_', other files and folders that don't, then
// calls removeTaskDirs(tempDir), and tests that only folders that started with
// 'task_' were deleted and that the other files and folders were not.
func TestRemoveTaskDirs(t *testing.T) {
	d, err := ioutil.TempDir("", t.Name())
	if err != nil {
		t.Fatalf("Could not create temp directory: %v", err)
	}
	defer func() {
		err := os.RemoveAll(d)
		if err != nil {
			t.Fatalf("Could not remove temp dir %v: %v", d, err)
		}
	}()
	for _, dir := range []string{
		"task_1234561234", // should remain
		"task_12345",      // should be deleted
		"task_task_test",  // should be deleted
		"test_12345",      // should remain
		"bfdnbdfd",        // should remain
	} {
		err = os.MkdirAll(filepath.Join(d, dir), 0777)
		if err != nil {
			t.Fatalf("Could not create temp %v directory: %v", dir, err)
		}
	}
	for _, file := range []string{
		filepath.Join("task_1234561234", "xyz"), // should remain
		"task_23456",                            // should remain
		"task_best_vest",                        // should remain
		"testt_65536",                           // should remain
		"applesnpears",                          // should remain
		filepath.Join("task_12345", "abcde"),    // should be deleted
	} {
		err = ioutil.WriteFile(filepath.Join(d, file), []byte("hello world"), 0777)
		if err != nil {
			t.Fatalf("Could not write %v file: %v", file, err)
		}
	}
	deleteTaskDirs(d, "task_1234561234")
	taskDirsParent, err := os.Open(d)
	if err != nil {
		t.Fatalf("Could not open %v directory: %v", d, err)
	}
	defer func() {
		err := taskDirsParent.Close()
		if err != nil {
			t.Fatalf("Could not close %v directory: %v", d, err)
		}
	}()
	fi, err := taskDirsParent.Readdir(-1)
	if err != nil {
		t.Fatalf("Error reading directory listing of %v: %v", d, err)
	}
	expectedDirs := map[string]bool{
		"task_1234561234": true,
		"test_12345":      true,
		"bfdnbdfd":        true,
	}
	expectedFiles := map[string]bool{
		"task_23456":     true,
		"task_best_vest": true,
		"testt_65536":    true,
		"applesnpears":   true,
	}
	if len(fi) != len(expectedDirs)+len(expectedFiles) {
		t.Logf("Found:")
		for _, file := range fi {
			if file.IsDir() {
				t.Logf("  Directory %v", file.Name())
			} else {
				t.Logf("  File %v", file.Name())
			}
		}
		t.Logf("Expected files: %v", expectedFiles)
		t.Logf("Expected directories: %v", expectedDirs)
		t.Fatalf("Expected to find %v directory records (%v dirs + %v files) but found %v", len(expectedDirs)+len(expectedFiles), len(expectedDirs), len(expectedFiles), len(fi))
	}
	for _, file := range fi {
		if file.IsDir() {
			if !expectedDirs[file.Name()] {
				t.Fatalf("Didn't expect to find dir %v but found it under temp dir %v", file.Name(), d)
			}
		} else {
			if !expectedFiles[file.Name()] {
				t.Fatalf("Didn't expect to find file %v but found it under temp dir %v", file.Name(), d)
			}
		}
	}
}

func TestUsage(t *testing.T) {
	usage := usage("generic-worker")
	if !strings.Contains(usage, "Exit Codes:") {
		t.Fatal("Was expecting the usage text to include information about exit codes")
	}
}
