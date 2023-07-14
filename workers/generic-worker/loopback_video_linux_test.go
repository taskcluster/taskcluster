//go:build linux

package main

import (
	"fmt"
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestLoopbackVideo(t *testing.T) {
	setup(t)

	devicePath := fmt.Sprintf("/dev/video%d", config.LoopbackVideoDeviceNumber)
	payload := GenericWorkerPayload{
		Command: [][]string{
			{"ls", "-l", devicePath},
			{"/usr/bin/env", "bash", "-c", `echo "Device: $TASKCLUSTER_VIDEO_DEVICE"`},
		},
		MaxRunTime: 30,
		Features: FeatureFlags{
			LoopbackVideo: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:loopback-video")

	_ = submitAndAssert(t, td, payload, "completed", "completed")

	logText := LogText(t)
	if !strings.Contains(logText, "Device: "+devicePath) {
		t.Fatalf("Expected log to contain 'Device: %s', but it didn't\n%s", devicePath, logText)
	}
	if !strings.Contains(logText, "crw-rw----") {
		t.Fatalf("Expected log to contain 'crw-rw----', but it didn't\n%s", logText)
	}
}

func TestIncorrectLoopbackVideoScopes(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 30,
		Features: FeatureFlags{
			LoopbackVideo: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	// don't set any scopes
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, "generic-worker:loopback-video:"+td.ProvisionerID+"/"+td.WorkerType) || !strings.Contains(logtext, "generic-worker:loopback-video") {
		t.Fatalf("Expected log file to contain missing scopes, but it didn't\n%s", logtext)
	}
}

func TestLoopbackVideoNotOwnedByTaskUser(t *testing.T) {
	setup(t)

	devicePath := fmt.Sprintf("/dev/video%d", config.LoopbackVideoDeviceNumber)
	payload := GenericWorkerPayload{
		Command: [][]string{
			{"ls", "-l", devicePath},
		},
		MaxRunTime: 30,
		Features: FeatureFlags{
			// run once with loopback video feature enabled,
			// so that we can ensure tbe device has been created
			// on the host
			LoopbackVideo: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:loopback-video")

	_ = submitAndAssert(t, td, payload, "completed", "completed")

	payload = GenericWorkerPayload{
		Command: [][]string{
			{"ls", "-l", devicePath},
		},
		MaxRunTime: 30,
		Features: FeatureFlags{
			// run a second time with the feature disabled
			// to test that the device is not owned by the
			// task user
			LoopbackVideo: false,
		},
	}
	defaults.SetDefaults(&payload)
	td = testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:loopback-video")

	_ = submitAndAssert(t, td, payload, "completed", "completed")

	logtext := LogText(t)
	if strings.Contains(logtext, "task_") {
		t.Fatalf("Was not expecting `ls` on device %s to be owned by task user, but it was", devicePath)
	}
}
