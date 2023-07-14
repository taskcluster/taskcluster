package main

import (
	"encoding/json"
	"fmt"
	"runtime"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v54/tools/d2g/dockerworker"
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
		MaxRunTime: 10,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	switch fmt.Sprintf("%s:%s", runtime.GOOS, engine) {
	case "linux:multiuser":
		_ = submitAndAssert(t, td, payload, "completed", "completed")
	default:
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	}
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
