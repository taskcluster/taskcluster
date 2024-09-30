package main

import (
	"encoding/json"
	"fmt"
	"runtime"
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v72/tools/d2g/dockerworker"
)

func TestWithValidDockerWorkerPayload(t *testing.T) {
	setup(t)
	image := map[string]interface{}{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command:    []string{"/bin/bash", "-c", "echo hello world"},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		_ = submitAndAssert(t, td, payload, "completed", "completed")
	case "insecure:linux":
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
		logtext := LogText(t)
		if !strings.Contains(logtext, "task payload contains unsupported osGroups: [docker]") {
			t.Fatalf("Was expecting log file to contain 'task payload contains unsupported osGroups: [docker]")
		}
	default:
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	}
	t.Log(LogText(t))
}

func TestWithInvalidDockerWorkerPayload(t *testing.T) {
	setup(t)
	image := map[string]interface{}{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{"/bin/bash", "-c", "echo hello world"},
		Image:   json.RawMessage(imageBytes),
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}

func TestIssue6789(t *testing.T) {
	setup(t)
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{"/bin/bash", "-c", "URL=\"${TASKCLUSTER_PROXY_URL}/api/queue/v1/task/${TASK_ID}\"\ncurl -v \"${URL}\"\ncurl -sf \"${URL}\""},
		Image:   json.RawMessage(`"denolehov/curl"`),
		Features: dockerworker.FeatureFlags{
			TaskclusterProxy: true,
		},
		MaxRunTime: 10,
		Cache: map[string]string{
			"d2g-test": "/foo",
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, "docker-worker:cache:d2g-test")

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		_ = submitAndAssert(t, td, payload, "completed", "completed")
	case "insecure:linux":
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
		logtext := LogText(t)
		if !strings.Contains(logtext, "task payload contains unsupported osGroups: [docker]") {
			t.Fatalf("Was expecting log file to contain 'task payload contains unsupported osGroups: [docker]")
		}
	default:
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	}
	t.Log(LogText(t))
}
