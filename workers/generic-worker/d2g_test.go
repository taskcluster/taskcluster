package main

import (
	"encoding/json"
	"fmt"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/mcuadros/go-defaults"
	tcclient "github.com/taskcluster/taskcluster/v74/clients/client-go"
	"github.com/taskcluster/taskcluster/v74/tools/d2g/dockerworker"
)

func TestWithValidDockerWorkerPayload(t *testing.T) {
	setup(t)
	testTime := tcclient.Time(time.Now().AddDate(0, 0, 1))
	image := map[string]interface{}{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command:    []string{"/bin/bash", "-c", "echo hello world > testWithoutExpiresPath && echo bye > testWithExpiresPath"},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Artifacts: map[string]dockerworker.Artifact{
			"testWithoutExpires": {
				Path: "testWithoutExpiresPath",
				Type: "file",
				// purposely do NOT set Expires
				// because this is also testing
				// that the default expires value
				// is not present in the translated
				// generic worker task definition
				// Expires: tcclient.Time{},
			},
			"testWithExpires": {
				Path:    "testWithExpiresPath",
				Type:    "file",
				Expires: testTime,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		_ = submitAndAssert(t, td, payload, "completed", "completed")
		logtext := LogText(t)
		t.Log(logtext)
		// tests the default artifact expiry is not present in the
		// translated task definition
		if strings.Contains(logtext, "0001-01-01T00:00:00.000Z") {
			t.Fatal("Was expecting log file to not contain '0001-01-01T00:00:00.000Z'")
		}
		// tests the set artifact expiry is present in the
		// translated task definition
		if testTimeStr := testTime.String(); !strings.Contains(logtext, testTimeStr) {
			t.Fatalf("Was expecting log file to contain '%s'", testTimeStr)
		}
	case "insecure:linux":
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
		logtext := LogText(t)
		t.Log(logtext)
		if !strings.Contains(logtext, "task payload contains unsupported osGroups: [docker]") {
			t.Fatal("Was expecting log file to contain 'task payload contains unsupported osGroups: [docker]'")
		}
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
		t.Log(logtext)
		if !strings.Contains(logtext, "task payload contains unsupported osGroups: [docker]") {
			t.Fatalf("Was expecting log file to contain 'task payload contains unsupported osGroups: [docker]'")
		}
	default:
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	}
}

func TestDockerWorkerPayloadWithValidScopes(t *testing.T) {
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
		Capabilities: dockerworker.Capabilities{
			Privileged: true,
			Devices: dockerworker.Devices{
				HostSharedMemory: true,
				KVM:              true,
			},
		},
		Features: dockerworker.FeatureFlags{
			AllowPtrace: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, []string{
		"docker-worker:capability:privileged:" + td.ProvisionerID + "/" + td.WorkerType,
		"docker-worker:capability:device:hostSharedMemory:" + td.ProvisionerID + "/" + td.WorkerType,
		"docker-worker:capability:device:kvm:" + td.ProvisionerID + "/" + td.WorkerType,
		"docker-worker:feature:allowPtrace",
	}...)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		_ = submitAndAssert(t, td, payload, "completed", "completed")
	case "insecure:linux":
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
		logtext := LogText(t)
		t.Log(logtext)
		if !strings.Contains(logtext, "task payload contains unsupported osGroups: [kvm libvirt docker]") {
			t.Fatalf("Was expecting log file to contain 'task payload contains unsupported osGroups: [kvm libvirt docker]'")
		}
	default:
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	}
}

func TestDockerWorkerPayloadWithInvalidScopes(t *testing.T) {
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
		Capabilities: dockerworker.Capabilities{
			Privileged: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	// don't set any scopes

	switch runtime.GOOS {
	case "linux":
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
		logtext := LogText(t)
		t.Log(logtext)
		if !strings.Contains(logtext, "docker-worker:capability:privileged:"+td.ProvisionerID+"/"+td.WorkerType) || !strings.Contains(logtext, "docker-worker:capability:privileged") {
			t.Fatalf("Expected log file to contain missing scopes, but it didn't")
		}
	default:
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	}
}
