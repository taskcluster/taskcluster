//go:build darwin || linux || freebsd

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/mcuadros/go-defaults"

	"github.com/taskcluster/taskcluster/v113/workers/generic-worker/graceful"
)

// The task log includes the commands that are run, so markers that the task
// commands output are computed by the shell, so that they only appear in the
// log if the command actually printed them.
const (
	sigtermHandledMarker = "SIGTERM-handled-42"
	summaryWrittenMarker = "summary-written-42"
	sigtermIgnoredMarker = "SIGTERM-ignored-42"
)

// handleSIGTERM returns a command that runs until it receives SIGTERM, and
// then logs a few lines before exiting, like a test harness writing its
// summary. If startedFile is not empty, it is created once the SIGTERM
// handler is in place.
func handleSIGTERM(startedFile string) [][]string {
	touch := ""
	if startedFile != "" {
		touch = fmt.Sprintf("touch '%v'; ", startedFile)
	}
	return [][]string{
		{
			"/usr/bin/env",
			"bash",
			"-c",
			`trap 'echo SIGTERM-handled-$((40+2)); sleep 1; echo summary-written-$((40+2)); exit 0' TERM; ` + touch + `sleep 600 & wait`,
		},
	}
}

// ignoreSIGTERM returns a command that ignores SIGTERM, and creates
// sigtermFile when it receives it.
func ignoreSIGTERM(sigtermFile string) [][]string {
	return [][]string{
		{
			"/usr/bin/env",
			"bash",
			"-c",
			fmt.Sprintf(`trap "echo SIGTERM-ignored-$((40+2)); touch '%v'" TERM; while true; do sleep 1; done`, sigtermFile),
		},
	}
}

// setAbortGracePeriod changes abortGracePeriod for the duration of the test.
func setAbortGracePeriod(t *testing.T, gracePeriod time.Duration) {
	t.Helper()
	previous := abortGracePeriod
	abortGracePeriod = gracePeriod
	t.Cleanup(func() {
		abortGracePeriod = previous
	})
}

// terminateWorkerWhenFileExists requests a graceful termination of the
// worker, without time to finish tasks (e.g. spot termination), once file
// exists.
func terminateWorkerWhenFileExists(t *testing.T, file string) {
	t.Helper()
	testDone := make(chan struct{})
	terminationDone := make(chan struct{})
	t.Cleanup(func() {
		close(testDone)
		<-terminationDone
	})
	go func() {
		defer close(terminationDone)
		deadline := time.After(time.Minute)
		for {
			if _, err := os.Stat(file); err == nil {
				graceful.Terminate(false)
				return
			}
			select {
			case <-testDone:
				return
			case <-deadline:
				return
			case <-time.After(100 * time.Millisecond):
			}
		}
	}()
}

func TestAbortGracePeriodMaxRunTime(t *testing.T) {
	setup(t)

	// Include a writable directory cache, to test that caches are still
	// purged when task processes exit by themselves during the grace period.
	mounts := []MountEntry{
		// requires scope "generic-worker:cache:tc-test-cache-1"
		&WritableDirectoryCache{
			CacheName: "tc-test-cache-1",
			Directory: filepath.Join("bananas"),
		},
	}

	payload := GenericWorkerPayload{
		Mounts: toMountArray(t, &mounts),
		Command: append(
			handleSIGTERM(""),
			// also make sure subsequent commands after abort don't run
			helloGoodbye()...,
		),
		MaxRunTime: 5,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = []string{"generic-worker:cache:tc-test-cache-1"}

	taskID := scheduleTask(t, td, payload)
	ensureResolution(t, taskID, "failed", "failed")

	logtext := string(getArtifactContent(t, taskID, "public/logs/live_backing.log"))
	for _, expected := range []string{
		"max run time exceeded",
		"Aborting task... sending SIGTERM to task processes, waiting up to 10s for them to exit before killing them",
		sigtermHandledMarker,
		summaryWrittenMarker,
		"Purging caches since the task was aborted",
	} {
		if !strings.Contains(logtext, expected) {
			t.Fatalf("Was expecting log file to contain %q, but it doesn't:\n%v", expected, logtext)
		}
	}
	for _, unexpected := range []string{
		"still running",
		"hello",
	} {
		if strings.Contains(logtext, unexpected) {
			t.Fatalf("Was not expecting log file to contain %q, but it does:\n%v", unexpected, logtext)
		}
	}
}

func TestAbortGracePeriodSIGTERMIgnored(t *testing.T) {
	setup(t)
	setAbortGracePeriod(t, 3*time.Second)

	sigtermFile := filepath.Join(worldWritableTempDir(t, "abort-grace-period"), "sigterm")
	payload := GenericWorkerPayload{
		Command:    ignoreSIGTERM(sigtermFile),
		MaxRunTime: 5,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	taskID := scheduleTask(t, td, payload)
	startTime := time.Now()
	ensureResolution(t, taskID, "failed", "failed")
	duration := time.Since(startTime)

	logtext := string(getArtifactContent(t, taskID, "public/logs/live_backing.log"))
	for _, expected := range []string{
		"max run time exceeded",
		sigtermIgnoredMarker,
		"Task processes still running 3s after SIGTERM - killing them",
	} {
		if !strings.Contains(logtext, expected) {
			t.Fatalf("Was expecting log file to contain %q, but it doesn't:\n%v", expected, logtext)
		}
	}
	if duration < 8*time.Second {
		t.Fatalf("Task resolved after %v, which is before max run time (5s) + grace period (3s)", duration)
	}
}

// When the worker is shutting down, task processes are killed without a grace
// period, so that the worker can shut down quickly.
func TestAbortWorkerShutdownKillsImmediately(t *testing.T) {
	setup(t)

	startedFile := filepath.Join(worldWritableTempDir(t, "abort-grace-period"), "started")
	payload := GenericWorkerPayload{
		Command:    handleSIGTERM(startedFile),
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	terminateWorkerWhenFileExists(t, startedFile)
	taskID := scheduleTask(t, td, payload)
	ensureResolution(t, taskID, "exception", "worker-shutdown")

	logtext := LogText(t)
	if !strings.Contains(logtext, "[taskcluster:error] Aborting task...\n") {
		t.Fatalf("Was expecting log file to mention task abortion, but it doesn't:\n%v", logtext)
	}
	for _, unexpected := range []string{
		"sending SIGTERM",
		sigtermHandledMarker,
	} {
		if strings.Contains(logtext, unexpected) {
			t.Fatalf("Was not expecting log file to contain %q, but it does:\n%v", unexpected, logtext)
		}
	}
}

// When the worker starts shutting down while task processes are being given
// time to exit, they are killed straight away, and the task keeps the reason
// it was first aborted for.
func TestAbortWorkerShutdownDuringGracePeriod(t *testing.T) {
	setup(t)
	setAbortGracePeriod(t, time.Minute)

	sigtermFile := filepath.Join(worldWritableTempDir(t, "abort-grace-period"), "sigterm")
	payload := GenericWorkerPayload{
		Command:    ignoreSIGTERM(sigtermFile),
		MaxRunTime: 5,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	terminateWorkerWhenFileExists(t, sigtermFile)
	taskID := scheduleTask(t, td, payload)
	startTime := time.Now()
	ensureResolution(t, taskID, "failed", "failed")
	duration := time.Since(startTime)

	logtext := string(getArtifactContent(t, taskID, "public/logs/live_backing.log"))
	for _, expected := range []string{
		"max run time exceeded",
		sigtermIgnoredMarker,
		"Killing task processes: graceful termination requested, without time to finish tasks",
	} {
		if !strings.Contains(logtext, expected) {
			t.Fatalf("Was expecting log file to contain %q, but it doesn't:\n%v", expected, logtext)
		}
	}
	if strings.Contains(logtext, "still running") {
		t.Fatalf("Was not expecting the grace period to expire:\n%v", logtext)
	}
	if duration > 45*time.Second {
		t.Fatalf("Task took %v to resolve, so the worker seems to have waited for the whole grace period", duration)
	}
}
