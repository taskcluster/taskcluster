package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

var (
	expiry queue.Time
	// all tests can share taskGroupId so we can view all test tasks in same
	// graph later for troubleshooting
	taskGroupId string = slugid.Nice()
)

func setup(t *testing.T) {
	// some basic setup...
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Test failed during setup phase!")
	}
	TaskUser.HomeDir = filepath.Join(cwd, "test")

	expiry = queue.Time(time.Now().Add(time.Minute * 1))
}

func validateArtifacts(
	t *testing.T,
	payloadArtifacts []struct {
		Expires queue.Time `json:"expires"`
		Path    string     `json:"path"`
		Type    string     `json:"type"`
	},
	expected []Artifact) {

	// to test, create a dummy task run with given artifacts
	// and then call PayloadArtifacts() method to see what
	// artifacts would get uploaded...
	tr := &TaskRun{
		Payload: GenericWorkerPayload{
			Artifacts: payloadArtifacts,
		},
	}
	artifacts := tr.PayloadArtifacts()

	// compare expected vs actual artifacts by converting artifacts to strings...
	if fmt.Sprintf("%q", artifacts) != fmt.Sprintf("%q", expected) {
		t.Fatalf("Expected different artifacts to be generated...\nExpected:\n%q\nActual:\n%q", expected, artifacts)
	}
}

// See the test/SampleArtifacts subdirectory of this project. This simulates
// adding it as a directory artifact in a task payload, and checks that all
// files underneath this directory are discovered and created as s3 artifacts.
func TestDirectoryArtifacts(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]struct {
			Expires queue.Time `json:"expires"`
			Path    string     `json:"path"`
			Type    string     `json:"type"`
		}{{
			Expires: expiry,
			Path:    "SampleArtifacts",
			Type:    "directory",
		}},

		// what we expect to discover on file system
		[]Artifact{
			S3Artifact{
				BaseArtifact: BaseArtifact{
					CanonicalPath: "SampleArtifacts/%%%/v/X",
					Expires:       expiry,
				},
				MimeType: "application/octet-stream",
			},
			S3Artifact{
				BaseArtifact: BaseArtifact{
					CanonicalPath: "SampleArtifacts/_/X.txt",
					Expires:       expiry,
				},
				MimeType: "text/plain; charset=utf-8",
			},
			S3Artifact{
				BaseArtifact: BaseArtifact{
					CanonicalPath: "SampleArtifacts/b/c/d.jpg",
					Expires:       expiry,
				},
				MimeType: "image/jpeg",
			},
		})
}

// Task payload specifies a file artifact which doesn't exist on worker
func TestMissingFileArtifact(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]struct {
			Expires queue.Time `json:"expires"`
			Path    string     `json:"path"`
			Type    string     `json:"type"`
		}{{
			Expires: expiry,
			Path:    "TestMissingFileArtifact/no_such_file",
			Type:    "file",
		}},

		// what we expect to discover on file system
		[]Artifact{
			ErrorArtifact{
				BaseArtifact: BaseArtifact{
					CanonicalPath: "TestMissingFileArtifact/no_such_file",
					Expires:       expiry,
				},
				Message: "Could not read file '" + filepath.Join(TaskUser.HomeDir, "TestMissingFileArtifact", "no_such_file") + "'",
				Reason:  "file-missing-on-worker",
			},
		})
}

// Task payload specifies a directory artifact which doesn't exist on worker
func TestMissingDirectoryArtifact(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]struct {
			Expires queue.Time `json:"expires"`
			Path    string     `json:"path"`
			Type    string     `json:"type"`
		}{{
			Expires: expiry,
			Path:    "TestMissingDirectoryArtifact/no_such_dir",
			Type:    "directory",
		}},

		// what we expect to discover on file system
		[]Artifact{
			ErrorArtifact{
				BaseArtifact: BaseArtifact{
					CanonicalPath: "TestMissingDirectoryArtifact/no_such_dir",
					Expires:       expiry,
				},
				Message: "Could not read directory '" + filepath.Join(TaskUser.HomeDir, "TestMissingDirectoryArtifact", "no_such_dir") + "'",
				Reason:  "file-missing-on-worker",
			},
		})
}

// Task payload specifies a file artifact which is actually a directory on worker
func TestFileArtifactIsDirectory(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]struct {
			Expires queue.Time `json:"expires"`
			Path    string     `json:"path"`
			Type    string     `json:"type"`
		}{{
			Expires: expiry,
			Path:    "SampleArtifacts/b/c",
			Type:    "file",
		}},

		// what we expect to discover on file system
		[]Artifact{
			ErrorArtifact{
				BaseArtifact: BaseArtifact{
					CanonicalPath: "SampleArtifacts/b/c",
					Expires:       expiry,
				},
				Message: "File artifact '" + filepath.Join(TaskUser.HomeDir, "SampleArtifacts", "b", "c") + "' exists as a directory, not a file, on the worker",
				Reason:  "invalid-resource-on-worker",
			},
		})
}

// Task payload specifies a directory artifact which is a regular file on worker
func TestDirectoryArtifactIsFile(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]struct {
			Expires queue.Time `json:"expires"`
			Path    string     `json:"path"`
			Type    string     `json:"type"`
		}{{
			Expires: expiry,
			Path:    "SampleArtifacts/b/c/d.jpg",
			Type:    "directory",
		}},

		// what we expect to discover on file system
		[]Artifact{
			ErrorArtifact{
				BaseArtifact: BaseArtifact{
					CanonicalPath: "SampleArtifacts/b/c/d.jpg",
					Expires:       expiry,
				},
				Message: "Directory artifact '" + filepath.Join(TaskUser.HomeDir, "SampleArtifacts", "b", "c", "d.jpg") + "' exists as a file, not a directory, on the worker",
				Reason:  "invalid-resource-on-worker",
			},
		})
}

func TestUpload(t *testing.T) {

	// first create dummy task

	clientId := os.Getenv("TASKCLUSTER_CLIENT_ID")
	accessToken := os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	certificate := os.Getenv("TASKCLUSTER_CERTIFICATE")
	if clientId == "" || accessToken == "" {
		t.Skip("Skipping test since TASKCLUSTER_CLIENT_ID and/or TASKCLUSTER_ACCESS_TOKEN env vars not set")
	}
	myQueue := queue.New(clientId, accessToken)
	myQueue.Certificate = certificate

	taskId := slugid.Nice()
	// create a random workerType so parallel tests don't crash into each other
	// give a fixed prefix so we don't have to allow workerType = * in scopes
	workerType := generic_worker_test_slugid.Nice()
	created := time.Now()
	deadline := created.AddDate(0, 0, 1)
	expires := deadline

	td := &queue.TaskDefinitionRequest{
		Created:  queue.Time(created),
		Deadline: queue.Time(deadline),
		Expires:  queue.Time(expires),
		Extra:    json.RawMessage(`{}`),
		Metadata: struct {
			Description string `json:"description"`
			Name        string `json:"name"`
			Owner       string `json:"owner"`
			Source      string `json:"source"`
		}{
			Description: "Test task",
			Name:        "[TC] TestUpload",
			Owner:       "pmoore@mozilla.com",
			Source:      "https://github.com/taskcluster/generic-worker/blob/master/artifacts_test.go",
		},
		Payload: json.RawMessage(`
		
		{
			"command": [
				"fake command"
			],
			"maxRunTime": 7200,
			"artifacts": [
				{
					"path": "SampleArtifacts/_/X.txt",
					"expires": "` + queue.Time(expires).String() + `",
					"type": "file"
				}
			]
		}
		
		`),
		ProvisionerId: "test-provisioner",
		Retries:       1,
		Routes:        []string{},
		SchedulerId:   "test-scheduler",
		Scopes:        []string{},
		Tags:          json.RawMessage(`{"createdForUser":"pmoore@mozilla.com"}`),
		Priority:      "normal",
		TaskGroupId:   taskGroupId,
		WorkerType:    workerType,
	}

	_, cs := myQueue.CreateTask(taskId, td)

	if cs.Error != nil {
		t.Fatalf("Suffered error when posting task to Queue in test setup:\n%s", cs.Error)
	}

	// now claim the task

	artifacts := tr.PayloadArtifacts()
	tr.uploadLog("SampleArtifacts/_/X.txt")
}
