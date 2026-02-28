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
	td.Scopes = append(td.Scopes, "generic-worker:loopback-video:"+td.ProvisionerID+"/"+td.WorkerType)

	_ = submitAndAssert(t, td, payload, "completed", "completed")

	logText := LogText(t)
	if !strings.Contains(logText, "Device: "+devicePath) {
		t.Fatalf("Expected log to contain 'Device: %s', but it didn't\n%s", devicePath, logText)
	}
	if !strings.Contains(logText, "crw-rw----+ 1 root video") {
		t.Fatalf("Expected log to contain 'crw-rw----+ 1 root video', but it didn't\n%s", logText)
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
