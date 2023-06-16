//go:build linux

package main

import (
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestLoopbackVideo(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command: [][]string{
			{"ls", "-l", "/dev/video0"},
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
	if !strings.Contains(logText, "/dev/video0") {
		t.Fatalf("Expected log to contain /dev/video0, but it didn't\n%s", logText)
	}
	if !strings.Contains(logText, "crw-rw----") {
		t.Fatalf("Expected log to contain crw-rw----, but it didn't\n%s", logText)
	}
}

func TestLoopbackVideoEnvVar(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command: [][]string{
			{"/bin/bash", "-c", "echo $TASKCLUSTER_VIDEO_DEVICE"},
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
	if !strings.Contains(logText, "/dev/video0") {
		t.Fatalf("Expected log to contain /dev/video0, but it didn't\n%s", logText)
	}
}
