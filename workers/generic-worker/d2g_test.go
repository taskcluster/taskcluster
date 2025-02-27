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
	tcclient "github.com/taskcluster/taskcluster/v83/clients/client-go"
	"github.com/taskcluster/taskcluster/v83/tools/d2g"
	"github.com/taskcluster/taskcluster/v83/tools/d2g/dockerworker"
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
	config.PublicPlatformConfig.EnableD2G(t)

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
	config.PublicPlatformConfig.EnableD2G(t)

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
	config.PublicPlatformConfig.EnableD2G(t)

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
	config.PublicPlatformConfig.EnableD2G(t)

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
	config.PublicPlatformConfig.EnableD2G(t)

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
	config.PublicPlatformConfig.EnableD2G(t)

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
	config.PublicPlatformConfig.EnableD2G(t)

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
	config.PublicPlatformConfig.EnableD2G(t)

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
	config.PublicPlatformConfig.EnableD2G(t)

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
	config.PublicPlatformConfig.EnableD2G(t)

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
	config.PublicPlatformConfig.EnableD2G(t)

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
			ImageHash:         "sha256:d1c5c701d837b59386563dc702932d200adc41f8bd99a1de451e6fcf378dbfa5",
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
			ImageHash:         "sha256:d1c5c701d837b59386563dc702932d200adc41f8bd99a1de451e6fcf378dbfa5",
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
			ImageHash:         "sha256:d1c5c701d837b59386563dc702932d200adc41f8bd99a1de451e6fcf378dbfa5",
			ImageArtifactHash: "sha256:050ba86afcb29779a0df1963df6d1e85eb9feff2c4c2a31b6c559686168be076",
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
	config.PublicPlatformConfig.EnableD2G(t)

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
