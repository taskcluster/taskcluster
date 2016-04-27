package main

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/streadway/amqp"
	"github.com/taskcluster/pulse-go/pulse"
	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-client-go/queue"
	"github.com/taskcluster/taskcluster-client-go/queueevents"
	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

var (
	expiry tcclient.Time
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

	expiry = tcclient.Time(time.Now().Add(time.Minute * 1))
}

func validateArtifacts(
	t *testing.T,
	payloadArtifacts []struct {
		Expires tcclient.Time `json:"expires"`
		Path    string        `json:"path"`
		Type    string        `json:"type"`
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
			Expires tcclient.Time `json:"expires"`
			Path    string        `json:"path"`
			Type    string        `json:"type"`
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
			Expires tcclient.Time `json:"expires"`
			Path    string        `json:"path"`
			Type    string        `json:"type"`
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
			Expires tcclient.Time `json:"expires"`
			Path    string        `json:"path"`
			Type    string        `json:"type"`
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
			Expires tcclient.Time `json:"expires"`
			Path    string        `json:"path"`
			Type    string        `json:"type"`
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
			Expires tcclient.Time `json:"expires"`
			Path    string        `json:"path"`
			Type    string        `json:"type"`
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

	// check we have all the env vars we need to run this test
	clientId := os.Getenv("TASKCLUSTER_CLIENT_ID")
	accessToken := os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	certificate := os.Getenv("TASKCLUSTER_CERTIFICATE")
	if clientId == "" || accessToken == "" {
		t.Skip("Skipping test since TASKCLUSTER_CLIENT_ID and/or TASKCLUSTER_ACCESS_TOKEN env vars not set")
	}

	pulseUsername := os.Getenv("PULSE_USERNAME")
	pulsePassword := os.Getenv("PULSE_PASSWORD")
	if pulseUsername == "" || pulsePassword == "" {
		t.Skip("Skipping test since PULSE_USERNAME and/or PULSE_PASSWORD env vars are not set")
	}

	// define a unique workerType/provisionerId combination for this session
	provisionerId := "test-provisioner"
	// this should be sufficiently unique
	workerType := slugid.Nice()
	taskId := slugid.Nice()

	// configure the worker
	config = &Config{
		AccessToken:                accessToken,
		Certificate:                certificate,
		ClientId:                   clientId,
		ProvisionerId:              provisionerId,
		RefreshUrlsPrematurelySecs: 310,
		WorkerGroup:                "test-worker-group",
		WorkerId:                   "test-worker-id",
		WorkerType:                 workerType,
		LiveLogExecutable:          "livelog",
		LiveLogSecret:              "xyz",
		PublicIP:                   net.ParseIP("127.0.0.1"),
		Subdomain:                  "taskcluster-worker.net",
	}

	// get the worker started
	// killWorkerChan := runWorker()
	runWorker()

	artifactCreatedMessages := make(map[string]*queueevents.ArtifactCreatedMessage)
	// size 1 so that we don't block writing on taskCompleted
	artifactsCreatedChan := make(chan bool, 1)
	taskCompleted := make(chan bool)
	// timeout after 30 seconds - that should be plenty
	timeoutTimer := time.NewTimer(time.Second * 30)

	// start a listener for published artifacts
	// (uses PULSE_USERNAME, PULSE_PASSWORD and prod url)
	pulseConn := pulse.NewConnection("", "", "")
	pulseConn.Consume(
		"", // anonymous queue
		func(message interface{}, delivery amqp.Delivery) {
			switch message.(type) {
			case *queueevents.ArtifactCreatedMessage:
				a := message.(*queueevents.ArtifactCreatedMessage)
				artifactCreatedMessages[a.Artifact.Name] = a
				// finish after 3 artifacts have been created
				if len(artifactCreatedMessages) == 3 {
					// killWorkerChan <- true
					// pulseConn.AMQPConn.Close()
					artifactsCreatedChan <- true
				}
			case *queueevents.TaskCompletedMessage:
				taskCompleted <- true
			}
		},
		1,    // prefetch
		true, // auto-ack
		queueevents.ArtifactCreated{
			TaskID:        taskId,
			WorkerType:    workerType,
			ProvisionerID: provisionerId,
		},
		queueevents.TaskCompleted{
			TaskID:        taskId,
			WorkerType:    workerType,
			ProvisionerID: provisionerId,
		},
	)

	// create dummy task
	myQueue := queue.New(
		&tcclient.Credentials{
			ClientId:    clientId,
			AccessToken: accessToken,
			Certificate: certificate,
		},
	)

	created := time.Now()
	// deadline in one days' time
	deadline := created.AddDate(0, 0, 1)
	// expiry in one month, in case we need test results
	expires := created.AddDate(0, 1, 0)

	td := &queue.TaskDefinitionRequest{
		Created:  tcclient.Time(created),
		Deadline: tcclient.Time(deadline),
		Expires:  tcclient.Time(expires),
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
				[
					"echo",
					"hello world!"
				]
			],
			"maxRunTime": 7200,
			"artifacts": [
				{
					"path": "SampleArtifacts/_/X.txt",
					"expires": "` + tcclient.Time(expires).String() + `",
					"type": "file"
				}
			]
		}
		
		`),
		ProvisionerID: provisionerId,
		Retries:       1,
		Routes:        []string{},
		SchedulerID:   "test-scheduler",
		Scopes:        []string{},
		Tags:          json.RawMessage(`{"createdForUser":"pmoore@mozilla.com"}`),
		Priority:      "normal",
		TaskGroupID:   taskGroupId,
		WorkerType:    workerType,
	}

	_, _, err := myQueue.CreateTask(taskId, td)

	if err != nil {
		t.Fatalf("Suffered error when posting task to Queue in test setup:\n%s", err)
	}

	expectedArtifacts := map[string]string{
		"public/logs/all_commands.log":   "hello world!\n",
		"public/logs/command_000000.log": "hello world!\n",
		"SampleArtifacts/_/X.txt":        "test artifact\n",
	}

	// wait for task to complete, so we know artifact upload also completed
	select {
	case <-timeoutTimer.C:
		t.Fatalf("Test timed out waiting for artifacts to be published")
	case <-taskCompleted:
	}

	// now check artifact metadata is ok
	select {
	case <-timeoutTimer.C:
		t.Fatalf("Test timed out waiting for artifacts to be published")
	case <-artifactsCreatedChan:
		for artifact, _ := range expectedArtifacts {
			if a := artifactCreatedMessages[artifact]; a != nil {
				if a.Artifact.ContentType != "text/plain; charset=utf-8" {
					t.Errorf("Artifact %s should have mime type 'text/plain; charset=utf-8' but has '%s'", artifact, a.Artifact.ContentType)
				}
				if a.Artifact.Expires.String() != tcclient.Time(expires).String() {
					t.Errorf("Artifact %s should have expiry '%s' but has '%s'", artifact, tcclient.Time(expires), a.Artifact.Expires)
				}
			} else {
				t.Errorf("Artifact '%s' not created", artifact)
			}
		}
	}

	// now check content was uploaded to Amazon, and is correct
	for artifact, content := range expectedArtifacts {
		cs, err := myQueue.GetLatestArtifact(taskId, artifact)
		if err != nil {
			t.Fatalf("Error trying to fetch artifacts from Amazon...\n%s", err)
		}
		if cs.HttpResponseBody != content {
			t.Errorf("Artifact '%s': Was expecting content '%s' but found '%s'", artifact, content, cs.HttpResponseBody)
		}
	}
}
