package main

import (
	"encoding/json"
	"fmt"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/mcuadros/go-defaults"
	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
	"github.com/taskcluster/taskcluster/v94/tools/d2g"
	"github.com/taskcluster/taskcluster/v94/tools/d2g/dockerworker"
)

func TestD2GWithValidDockerWorkerPayload(t *testing.T) {
	setup(t)
	testTime := tcclient.Time(time.Now().AddDate(0, 0, 1))
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			"echo hello world > testWithoutExpiresPath && echo bye > testWithExpiresPath",
		},
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

func TestD2GVolumeArtifacts(t *testing.T) {
	setup(t)
	testTime := tcclient.Time(time.Now().AddDate(0, 0, 1))
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			"mkdir -p /SampleArtifacts/_/ && echo hello world > /SampleArtifacts/_/X.txt",
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Artifacts: map[string]dockerworker.Artifact{
			"SampleArtifacts/_": {
				Path:    "/SampleArtifacts/_",
				Type:    "volume",
				Expires: testTime,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		taskID := submitAndAssert(t, td, payload, "completed", "completed")

		expectedArtifacts := ExpectedArtifacts{
			"SampleArtifacts/_/X.txt": {
				Extracts: []string{
					"hello world",
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				Expires:         testTime,
			},
			"public/logs/live_backing.log": {
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				Expires:         td.Expires,
			},
			"public/logs/live.log": {
				Extracts: []string{
					"=== Task Finished ===",
					"Exit Code: 0",
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				Expires:         td.Expires,
			},
		}
		expectedArtifacts.Validate(t, taskID, 0)
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

func TestD2GArtifactDoesNotExist(t *testing.T) {
	setup(t)
	testTime := tcclient.Time(time.Now().AddDate(0, 0, 1))
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			"mkdir -p SampleArtifacts/_/ && echo hello world > SampleArtifacts/_/X.txt",
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Artifacts: map[string]dockerworker.Artifact{
			"SampleArtifacts/_/X.txt": {
				Path:    "SampleArtifacts/_/X.txt",
				Type:    "file",
				Expires: testTime,
			},
			"nonExistingArtifact.txt": {
				Path:    "nonExistingArtifact.txt",
				Type:    "file",
				Expires: testTime,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		// will still resolve as `completed/completed` because d2g
		// will add the `optional` flag to the artifact during translation
		taskID := submitAndAssert(t, td, payload, "completed", "completed")

		expectedArtifacts := ExpectedArtifacts{
			"SampleArtifacts/_/X.txt": {
				Extracts: []string{
					"hello world",
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				Expires:         testTime,
			},
			"nonExistingArtifact.txt": {
				StorageType:      "error",
				SkipContentCheck: true,
			},
			"public/logs/live_backing.log": {
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				Expires:         td.Expires,
			},
			"public/logs/live.log": {
				Extracts: []string{
					"=== Task Finished ===",
					"Exit Code: 0",
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				Expires:         td.Expires,
			},
		}
		expectedArtifacts.Validate(t, taskID, 0)
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

func TestD2GWithInvalidDockerWorkerPayload(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			"echo hello world",
		},
		Image: json.RawMessage(imageBytes),
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}

func TestD2GIssue6789(t *testing.T) {
	setup(t)
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			"URL=\"${TASKCLUSTER_PROXY_URL}/api/queue/v1/task/${TASK_ID}\"\ncurl -v \"${URL}\"\ncurl -sf \"${URL}\"",
		},
		Image: json.RawMessage(`"denolehov/curl"`),
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

func TestD2GWithValidScopes(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			"echo hello world",
		},
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
		if !strings.Contains(logtext, "task payload contains unsupported osGroups: [docker]") {
			t.Fatalf("Was expecting log file to contain 'task payload contains unsupported osGroups: [docker]'")
		}
	default:
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	}
}

func TestD2GWithInvalidScopes(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			"echo hello world",
		},
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

func TestD2GLoopbackVideoDevice(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			"ls /dev && test -c ${TASKCLUSTER_VIDEO_DEVICE} || { echo 'Device not found' ; exit 1; }",
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Capabilities: dockerworker.Capabilities{
			Devices: dockerworker.Devices{
				LoopbackVideo: true,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, []string{
		"docker-worker:capability:device:loopbackVideo",
	}...)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		_ = submitAndAssert(t, td, payload, "completed", "completed")
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

func TestD2GLoopbackVideoDeviceWithWorkerPoolScopes(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			"ls /dev && test -c ${TASKCLUSTER_VIDEO_DEVICE} || { echo 'Device not found' ; exit 1; }",
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Capabilities: dockerworker.Capabilities{
			Devices: dockerworker.Devices{
				LoopbackVideo: true,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, []string{
		"docker-worker:capability:device:loopbackVideo:" + td.ProvisionerID + "/" + td.WorkerType,
	}...)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		_ = submitAndAssert(t, td, payload, "completed", "completed")
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

func TestD2GLoopbackVideoDeviceNonRootUserInVideoGroup(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			`groupadd -g 1001 testgroup && \
			useradd -u 1001 -g 1001 -M -s /bin/bash testuser && \
			usermod -aG video testuser && \
			su -m testuser -c 'whoami && groups && \
			ls -l "${TASKCLUSTER_VIDEO_DEVICE}" && \
			test -r "${TASKCLUSTER_VIDEO_DEVICE}" && \
			echo \"Access succeeded\" || { echo \"Access failed\"; exit 1; }'`,
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Capabilities: dockerworker.Capabilities{
			Devices: dockerworker.Devices{
				LoopbackVideo: true,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, []string{
		"docker-worker:capability:device:loopbackVideo",
	}...)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		_ = submitAndAssert(t, td, payload, "completed", "completed")
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

func TestD2GLoopbackVideoDeviceNonRootUserNotInVideoGroup(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			`groupadd -g 1001 testgroup && \
			useradd -u 1001 -g 1001 -M -s /bin/bash testuser && \
			su -m testuser -c 'whoami && groups && \
			ls -l "${TASKCLUSTER_VIDEO_DEVICE}" && \
			test -r "${TASKCLUSTER_VIDEO_DEVICE}" && \
			echo \"Access succeeded\" || { echo \"Access failed\"; exit 1; }'`,
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Capabilities: dockerworker.Capabilities{
			Devices: dockerworker.Devices{
				LoopbackVideo: true,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, []string{
		"docker-worker:capability:device:loopbackVideo",
	}...)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		// This test is expected to fail because the non-root user is not in the video group
		_ = submitAndAssert(t, td, payload, "failed", "failed")
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

func TestD2GLoopbackAudioDevice(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			`ls /dev/snd && test -c /dev/snd/controlC16 \
			-a -c /dev/snd/pcmC16D0c -a -c /dev/snd/pcmC16D0p \
			-a -c /dev/snd/pcmC16D1c -a -c /dev/snd/pcmC16D1p \
			|| { echo 'Device not found' ; exit 1; }`,
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Capabilities: dockerworker.Capabilities{
			Devices: dockerworker.Devices{
				LoopbackAudio: true,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, []string{
		"docker-worker:capability:device:loopbackAudio",
	}...)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		_ = submitAndAssert(t, td, payload, "completed", "completed")
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

func TestD2GLoopbackAudioDeviceWithWorkerPoolScopes(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			`ls /dev/snd && test -c /dev/snd/controlC16 \
			-a -c /dev/snd/pcmC16D0c -a -c /dev/snd/pcmC16D0p \
			-a -c /dev/snd/pcmC16D1c -a -c /dev/snd/pcmC16D1p \
			|| { echo 'Device not found' ; exit 1; }`,
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Capabilities: dockerworker.Capabilities{
			Devices: dockerworker.Devices{
				LoopbackAudio: true,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, []string{
		"docker-worker:capability:device:loopbackAudio:" + td.ProvisionerID + "/" + td.WorkerType,
	}...)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		_ = submitAndAssert(t, td, payload, "completed", "completed")
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

func TestD2GLoopbackAudioDeviceNonRootUserInAudioGroup(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			`groupadd -g 1001 testgroup && \
			useradd -u 1001 -g 1001 -M -s /bin/bash testuser && \
			usermod -aG audio testuser && \
			su -m testuser -c 'whoami && groups && \
			ls -l /dev/snd && \
			test -r /dev/snd/controlC16 \
			-a -r /dev/snd/pcmC16D0c -a -r /dev/snd/pcmC16D0p \
			-a -r /dev/snd/pcmC16D1c -a -r /dev/snd/pcmC16D1p && \
			echo \"Access succeeded\" || { echo \"Access failed\"; exit 1; }'`,
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Capabilities: dockerworker.Capabilities{
			Devices: dockerworker.Devices{
				LoopbackAudio: true,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, []string{
		"docker-worker:capability:device:loopbackAudio",
	}...)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		_ = submitAndAssert(t, td, payload, "completed", "completed")
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

func TestD2GLoopbackAudioDeviceNonRootUserNotInAudioGroup(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			`groupadd -g 1001 testgroup && \
			useradd -u 1001 -g 1001 -M -s /bin/bash testuser && \
			su -m testuser -c 'whoami && groups && \
			ls -l /dev/snd && \
			test -r /dev/snd/controlC16 \
			-a -r /dev/snd/pcmC16D0c -a -r /dev/snd/pcmC16D0p \
			-a -r /dev/snd/pcmC16D1c -a -r /dev/snd/pcmC16D1p && \
			echo \"Access succeeded\" || { echo \"Access failed\"; exit 1; }'`,
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Capabilities: dockerworker.Capabilities{
			Devices: dockerworker.Devices{
				LoopbackAudio: true,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, []string{
		"docker-worker:capability:device:loopbackAudio",
	}...)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		// This test is expected to fail because the non-root user is not in the audio group
		_ = submitAndAssert(t, td, payload, "failed", "failed")
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

func TestD2GDevicesWithoutAllScopes(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			"ls /dev && test -c ${TASKCLUSTER_VIDEO_DEVICE} || { echo 'Device not found' ; exit 1; }",
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Capabilities: dockerworker.Capabilities{
			Devices: dockerworker.Devices{
				LoopbackAudio: true,
				LoopbackVideo: true,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, []string{
		"docker-worker:capability:device:loopbackVideo",
	}...)

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}

func TestD2GHostSharedMemory(t *testing.T) {
	setup(t)
	image := map[string]any{
		"name": "ubuntu:latest",
		"type": "docker-image",
	}
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			"mount | grep dev/shm && mount | grep dev/shm | grep -vq size= || { echo '/dev/shm should not contain size'; exit 1; }",
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
		Capabilities: dockerworker.Capabilities{
			Devices: dockerworker.Devices{
				HostSharedMemory: true,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, []string{
		"docker-worker:capability:device:hostSharedMemory:" + td.ProvisionerID + "/" + td.WorkerType,
	}...)

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		_ = submitAndAssert(t, td, payload, "completed", "completed")
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

func TestD2GTaskclusterProxy(t *testing.T) {
	setup(t)

	dependentTaskID := CreateArtifactFromFile(t, "SampleArtifacts/_/X.txt", "SampleArtifacts/_/X.txt")
	artifactURL := fmt.Sprintf("${TASKCLUSTER_PROXY_URL}/queue/v1/task/%s/artifacts/SampleArtifacts/_/X.txt", dependentTaskID)

	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"/bin/bash",
			"-c",
			// sleep long enough to reclaim and get new credentials
			fmt.Sprintf("sleep 12 && curl -v %s", artifactURL),
		},
		Image:      json.RawMessage(`"denolehov/curl"`),
		MaxRunTime: 60,
		Features: dockerworker.FeatureFlags{
			TaskclusterProxy: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = []string{"queue:get-artifact:SampleArtifacts/_/X.txt"}
	td.Dependencies = []string{dependentTaskID}

	reclaimEvery5Seconds = true
	defer func() { reclaimEvery5Seconds = false }()

	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		taskID := submitAndAssert(t, td, payload, "completed", "completed")

		expectedArtifacts := ExpectedArtifacts{
			"public/logs/live_backing.log": {
				Extracts: []string{
					"Successfully refreshed taskcluster-proxy credentials",
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				Expires:         td.Expires,
			},
			"public/logs/live.log": {
				Extracts: []string{
					"Successfully refreshed taskcluster-proxy credentials",
					"=== Task Finished ===",
					"Exit Code: 0",
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				Expires:         td.Expires,
			},
		}

		expectedArtifacts.Validate(t, taskID, 0)
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

// Here we create some convenience types to represent a subset of the fields in
// a Docker Worker Chain of Trust certificate. We include some standard fields
// common to Generic Worker Chain of Trust certificates too, to make sure that
// adding Docker Worker fields to the Chain of Trust certificate doesn't cause
// other fields to get replaced/removed.
type (
	DockerWorkerPartialChainOfTrustCert struct {
		Environment PartialEnvironment
		Task        PartialTask
	}
	PartialEnvironment struct {
		ImageHash         string `json:"imageHash"`         // always present
		ImageArtifactHash string `json:"imageArtifactHash"` // present when image from a task
		Region            string `json:"region"`
	}
	PartialTask struct {
		ProvisionerID string `json:"provisionerId"`
		Payload       PartialPayload
	}
	PartialPayload struct {
		// This ensures to test that the Docker Worker command is included,
		// rather than the Generic Worker native command generated by D2G.
		Command []string `json:"command"`
	}
)

func TestD2GChainOfTrustNamedDockerImage(t *testing.T) {

	setup(t)
	image := d2g.NamedDockerImage{
		Name: "taskcluster/taskcluster-proxy:v81.0.2",
		Type: "docker-image",
	}

	expected := DockerWorkerPartialChainOfTrustCert{
		Environment: PartialEnvironment{
			ImageHash:         "sha256:9db1327bff0f7565c2e658371ec726bc2475fa30fce7366f6b1579894fd621d6",
			ImageArtifactHash: "",
			Region:            "test-worker-group",
		},
		Task: PartialTask{
			ProvisionerID: "test-provisioner",
			Payload: PartialPayload{
				Command: []string{
					"taskcluster-proxy",
					"--version",
				},
			},
		},
	}

	D2GChainOfTrustHelper(t, &image, []string{}, expected)
}

func TestD2GChainOfTrustDockerImageName(t *testing.T) {

	setup(t)
	image := d2g.DockerImageName("taskcluster/taskcluster-proxy:v81.0.2")

	expected := DockerWorkerPartialChainOfTrustCert{
		Environment: PartialEnvironment{
			ImageHash:         "sha256:9db1327bff0f7565c2e658371ec726bc2475fa30fce7366f6b1579894fd621d6",
			ImageArtifactHash: "",
			Region:            "test-worker-group",
		},
		Task: PartialTask{
			ProvisionerID: "test-provisioner",
			Payload: PartialPayload{
				Command: []string{
					"taskcluster-proxy",
					"--version",
				},
			},
		},
	}

	D2GChainOfTrustHelper(t, &image, []string{}, expected)
}

func TestD2GChainOfTrustDockerImageArtifact(t *testing.T) {

	setup(t)
	taskID := CreateArtifactFromFile(t, "docker-images/taskcluster-proxy-v81.0.2.tar.gz", "public/taskcluster-proxy.tar.gz")

	image := d2g.DockerImageArtifact{
		Path:   "public/taskcluster-proxy.tar.gz",
		TaskID: taskID,
		Type:   "task-image",
	}

	expected := DockerWorkerPartialChainOfTrustCert{
		Environment: PartialEnvironment{
			ImageHash:         "sha256:ac3db45b6b91d9e03e28015d293fee6a8142ea19d3b70c9903a4ca1dc072b7b0",
			ImageArtifactHash: "sha256:ed47090e5110b8ffb2d0aa3ed27be29cc9e1149aad4fd7769884224ee56506dc",
			Region:            "test-worker-group",
		},
		Task: PartialTask{
			ProvisionerID: "test-provisioner",
			Payload: PartialPayload{
				Command: []string{
					"taskcluster-proxy",
					"--version",
				},
			},
		},
	}

	D2GChainOfTrustHelper(t, &image, []string{taskID}, expected)
}

func TestD2GChainOfTrustIndexedDockerImage(t *testing.T) {

	// TODO: create a task that generates a small docker image, with an index,
	// and submit it and then modify the task below to pull in that image. The
	// artifact should expire quickly, because maybe the task is run against a
	// real taskcluster instance, not necessarily a mock.
	t.Skip()

	setup(t)
	image := d2g.IndexedDockerImage{
		Namespace: "foo",
		Path:      "foo",
		Type:      "indexed-image",
	}

	expected := DockerWorkerPartialChainOfTrustCert{}

	D2GChainOfTrustHelper(t, &image, []string{}, expected)
}

// Helper method to submit a Docker Worker Chain of Trust task, and compare the
// resulting Chain Of Trust certificate against the partial one passed into the
// function.
func D2GChainOfTrustHelper(t *testing.T, image d2g.Image, taskDependencies []string, expected DockerWorkerPartialChainOfTrustCert) {
	t.Helper()
	imageBytes, err := json.Marshal(image)
	if err != nil {
		t.Fatalf("Error marshaling JSON: %v", err)
	}
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{
			"taskcluster-proxy",
			"--version",
		},
		Features: dockerworker.FeatureFlags{
			ChainOfTrust: true,
		},
		Image:      json.RawMessage(imageBytes),
		MaxRunTime: 30,
	}

	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Dependencies = taskDependencies

	var taskID string
	switch fmt.Sprintf("%s:%s", engine, runtime.GOOS) {
	case "multiuser:linux":
		taskID = submitAndAssert(t, td, payload, "completed", "completed")
	default:
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
		return
	}

	t.Log(LogText(t))

	cotUnsignedBytes := getArtifactContent(t, taskID, "public/chain-of-trust.json")
	certString := string(cotUnsignedBytes)
	cotCert := DockerWorkerPartialChainOfTrustCert{}
	err = json.Unmarshal(cotUnsignedBytes, &cotCert)
	if err != nil {
		t.Fatalf("Could not interpret public/chain-of-trust.json as json")
	}
	if !reflect.DeepEqual(cotCert, expected) {
		t.Fatalf("Expected vs actual mismatch. Expected: %#v, Actual: %#v, Raw: %s", expected, cotCert, certString)
	}
}
