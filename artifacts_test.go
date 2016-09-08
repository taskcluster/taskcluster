package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/openpgp"
	"golang.org/x/crypto/openpgp/clearsign"

	"github.com/streadway/amqp"
	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/pulse-go/pulse"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
	"github.com/taskcluster/taskcluster-client-go/queueevents"
)

var (
	expiry tcclient.Time
	// all tests can share taskGroupId so we can view all test tasks in same
	// graph later for troubleshooting
	taskGroupID string = slugid.Nice()
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
	clientID := os.Getenv("TASKCLUSTER_CLIENT_ID")
	accessToken := os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	certificate := os.Getenv("TASKCLUSTER_CERTIFICATE")
	if clientID == "" || accessToken == "" {
		t.Skip("Skipping test since TASKCLUSTER_CLIENT_ID and/or TASKCLUSTER_ACCESS_TOKEN env vars not set")
	}

	pulseUsername := os.Getenv("PULSE_USERNAME")
	pulsePassword := os.Getenv("PULSE_PASSWORD")
	if pulseUsername == "" || pulsePassword == "" {
		t.Skip("Skipping test since PULSE_USERNAME and/or PULSE_PASSWORD env vars are not set")
	}

	// define a unique workerType/provisionerId combination for this session
	provisionerID := "test-provisioner"
	// this should be sufficiently unique
	workerType := slugid.Nice()
	taskID := slugid.Nice()

	// configure the worker
	config = &Config{
		SigningKeyLocation:         "test/private-opengpg-key",
		AccessToken:                accessToken,
		Certificate:                certificate,
		ClientID:                   clientID,
		ProvisionerID:              provisionerID,
		RefreshUrlsPrematurelySecs: 310,
		WorkerGroup:                "test-worker-group",
		WorkerID:                   "test-worker-id",
		WorkerType:                 workerType,
		LiveLogExecutable:          "livelog",
		LiveLogSecret:              "xyz",
		PublicIP:                   net.ParseIP("12.34.56.78"),
		PrivateIP:                  net.ParseIP("87.65.43.21"),
		InstanceID:                 "test-instance-id",
		InstanceType:               "p3.enormous",
		Region:                     "outer-space",
		Subdomain:                  "taskcluster-worker.net",
		WorkerTypeMetadata: map[string]interface{}{
			"aws": map[string]string{
				"ami-id":            "test-ami",
				"availability-zone": "outer-space",
				"instance-id":       "test-instance-id",
				"instance-type":     "p3.enormous",
				"public-ipv4":       "12.34.56.78",
				"local-ipv4":        "87.65.43.21",
			},
			"generic-worker": map[string]string{
				"go-arch":    runtime.GOARCH,
				"go-os":      runtime.GOOS,
				"go-version": runtime.Version(),
				"release":    "test-release-url",
				"version":    version,
			},
			"machine-setup": map[string]string{
				"maintainer": "pmoore@mozilla.com",
				"script":     "test-script-url",
			},
		},
	}

	// get the worker started
	// killWorkerChan := runWorker()
	runWorker()

	artifactCreatedMessages := make(map[string]*queueevents.ArtifactCreatedMessage)
	// size 1 so that we don't block writing on taskCompleted
	artifactsCreatedChan := make(chan bool, 1)
	taskCompleted := make(chan bool)
	// timeout after 60 seconds - that should be plenty
	timeoutTimer := time.NewTimer(time.Second * 60)

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
				// Finish after 5 artifacts have been created. Note: the second
				// publish of the livelog artifact (for redirecting to the
				// underlying file rather than the livelog stream) doesn't
				// cause a new pulse message, hence this is 5 not 6.
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
			TaskID:        taskID,
			WorkerType:    workerType,
			ProvisionerID: provisionerID,
		},
		queueevents.TaskCompleted{
			TaskID:        taskID,
			WorkerType:    workerType,
			ProvisionerID: provisionerID,
		},
	)

	// create dummy task
	myQueue := queue.New(
		&tcclient.Credentials{
			ClientID:    clientID,
			AccessToken: accessToken,
			Certificate: certificate,
		},
	)

	created := time.Now().UTC()
	// reset nanoseconds
	created = created.Add(time.Nanosecond * time.Duration(created.Nanosecond()*-1))
	// deadline in one days' time
	deadline := created.AddDate(0, 0, 1)
	// expiry in one month, in case we need test results
	expires := created.AddDate(0, 1, 0)

	td := &queue.TaskDefinitionRequest{
		Created:      tcclient.Time(created),
		Deadline:     tcclient.Time(deadline),
		Expires:      tcclient.Time(expires),
		Extra:        json.RawMessage(`{}`),
		Dependencies: []string{},
		Requires:     "all-completed",
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
				],
				[
					"echo",
					"goodbye world!"
				]
			],
			"maxRunTime": 7200,
			"artifacts": [
				{
					"path": "SampleArtifacts/_/X.txt",
					"expires": "` + tcclient.Time(expires).String() + `",
					"type": "file"
				}
			],
            "features": {
              "generateCertificate": true
            }
		}
		
		`),
		ProvisionerID: provisionerID,
		Retries:       1,
		Routes:        []string{},
		SchedulerID:   "test-scheduler",
		Scopes:        []string{},
		Tags:          json.RawMessage(`{"createdForUser":"pmoore@mozilla.com"}`),
		Priority:      "normal",
		TaskGroupID:   taskGroupID,
		WorkerType:    workerType,
	}

	_, err := myQueue.CreateTask(taskID, td)

	if err != nil {
		t.Fatalf("Suffered error when posting task to Queue in test setup:\n%s", err)
	}

	// some required substrings - not all, just a selection
	expectedArtifacts := map[string]struct {
		extracts        []string
		contentEncoding string
	}{
		"public/logs/live_backing.log": {
			extracts: []string{
				"hello world!",
				"goodbye world!",
				`"instance-type": "p3.enormous"`,
			},
			contentEncoding: "gzip",
		},
		"public/logs/live.log": {
			extracts: []string{
				"hello world!",
				"goodbye world!",
				"=== Task Finished ===",
				"Exit Code: 0",
			},
			contentEncoding: "gzip",
		},
		"public/logs/certified.log": {
			extracts: []string{
				"hello world!",
				"goodbye world!",
				"=== Task Finished ===",
				"Exit Code: 0",
			},
			contentEncoding: "gzip",
		},
		"public/logs/chainOfTrust.json.asc": {
			// e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  ./%%%/v/X
			// 8308d593eb56527137532595a60255a3fcfbe4b6b068e29b22d99742bad80f6f  ./_/X.txt
			// a0ed21ab50992121f08da55365da0336062205fd6e7953dbff781a7de0d625b7  ./b/c/d.jpg
			extracts: []string{
				"8308d593eb56527137532595a60255a3fcfbe4b6b068e29b22d99742bad80f6f",
			},
			contentEncoding: "gzip",
		},
		"SampleArtifacts/_/X.txt": {
			extracts: []string{
				"test artifact",
			},
			contentEncoding: "",
		},
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
		for artifact := range expectedArtifacts {
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

	// signer of public/logs/chainOfTrust.json.asc
	signer := &openpgp.Entity{}
	cotCert := &ChainOfTrustCertificate{}

	for artifact, content := range expectedArtifacts {
		url, err := myQueue.GetLatestArtifact_SignedURL(taskID, artifact, 10*time.Minute)
		if err != nil {
			t.Fatalf("Error trying to fetch artifacts from Amazon...\n%s", err)
		}
		// need to do this so Content-Encoding header isn't swallowed by Go for test later on
		tr := &http.Transport{
			DisableCompression: true,
		}
		client := &http.Client{Transport: tr}
		rawResp, _, err := httpbackoff.ClientGet(client, url.String())
		resp, _, err := httpbackoff.Get(url.String())
		if err != nil {
			t.Fatalf("Error trying to fetch artifact from signed URL %s ...\n%s", url.String(), err)
		}
		b, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			t.Fatalf("Error trying to read response body of artifact from signed URL %s ...\n%s", url.String(), err)
		}
		for _, requiredSubstring := range content.extracts {
			if strings.Index(string(b), requiredSubstring) < 0 {
				t.Errorf("Artifact '%s': Could not find substring %q in '%s'", artifact, requiredSubstring, string(b))
			}
		}
		if actualContentEncoding := rawResp.Header.Get("Content-Encoding"); actualContentEncoding != content.contentEncoding {
			t.Fatalf("Expected Content-Encoding %q but got Content-Encoding %q for artifact %q from url %v", content.contentEncoding, actualContentEncoding, artifact, url)
		}
		if actualContentType := resp.Header.Get("Content-Type"); actualContentType != "text/plain; charset=utf-8" {
			t.Fatalf("Content-Type in Signed URL response does not match Content-Type of artifact")
		}
		// check openpgp signature is valid
		if artifact == "public/logs/chainOfTrust.json.asc" {
			pubKey, err := os.Open(filepath.Join("test", "public-openpgp-key"))
			if err != nil {
				t.Fatalf("Error opening public key file")
			}
			defer pubKey.Close()
			entityList, err := openpgp.ReadArmoredKeyRing(pubKey)
			if err != nil {
				t.Fatalf("Error decoding public key file")
			}
			block, _ := clearsign.Decode(b)
			signer, err = openpgp.CheckDetachedSignature(entityList, bytes.NewBuffer(block.Bytes), block.ArmoredSignature.Body)
			if err != nil {
				t.Fatalf("Not able to validate openpgp signature of public/logs/chainOfTrust.json.asc")
			}
			err = json.Unmarshal(block.Plaintext, cotCert)
			if err != nil {
				t.Fatalf("Could not interpret public/logs/chainOfTrust.json as json")
			}
		}
	}
	if signer == nil {
		t.Fatalf("Signer of public/logs/chainOfTrust.json.asc could not be established (is nil)")
	}
	if signer.Identities["Generic-Worker <taskcluster-accounts+gpgsigning@mozilla.com>"] == nil {
		t.Fatalf("Did not get correct signer identity in public/logs/chainOfTrust.json.asc - %#v", signer.Identities)
	}

	// This trickery is to convert a TaskDefinitionResponse into a
	// TaskDefinitionRequest in order that we can compare. We cannot cast, so
	// need to transform to json as an intermediary step.
	b, err := json.Marshal(cotCert.Task)
	if err != nil {
		t.Fatalf("Cannot marshal task into json - %#v\n%v", cotCert.Task, err)
	}
	cotCertTaskRequest := &queue.TaskDefinitionRequest{}
	err = json.Unmarshal(b, cotCertTaskRequest)
	if err != nil {
		t.Fatalf("Cannot unmarshal json into task request - %#v\n%v", string(b), err)
	}

	// The Payload, Tags and Extra fields are raw bytes, so differences may not
	// be valid. Since we are comparing the rest, let's skip these two fields,
	// as the rest should give us good enough coverage already
	cotCertTaskRequest.Payload = nil
	cotCertTaskRequest.Tags = nil
	cotCertTaskRequest.Extra = nil
	td.Payload = nil
	td.Tags = nil
	td.Extra = nil
	if !reflect.DeepEqual(cotCertTaskRequest, td) {
		t.Fatalf("Did not get back expected task definition in chain of trust certificate:\n%#v\n ** vs **\n%#v", cotCertTaskRequest, td)
	}
	if len(cotCert.Artifacts) != 2 {
		t.Fatalf("Expected 2 artifact hashes to be listed")
	}
	if cotCert.TaskID != taskID {
		t.Fatalf("Expected taskId to be %q but was %q", taskID, cotCert.TaskID)
	}
	if cotCert.RunID != 0 {
		t.Fatalf("Expected runId to be 0 but was %v", cotCert.RunID)
	}
	if cotCert.WorkerGroup != "test-worker-group" {
		t.Fatalf("Expected workerGroup to be \"test-worker-group\" but was %q", cotCert.WorkerGroup)
	}
	if cotCert.WorkerID != "test-worker-id" {
		t.Fatalf("Expected workerGroup to be \"test-worker-id\" but was %q", cotCert.WorkerID)
	}
	if cotCert.Environment.PublicIPAddress != "12.34.56.78" {
		t.Fatalf("Expected publicIpAddress to be 12.34.56.78 but was %v", cotCert.Environment.PublicIPAddress)
	}
	if cotCert.Environment.PrivateIPAddress != "87.65.43.21" {
		t.Fatalf("Expected privateIpAddress to be 87.65.43.21 but was %v", cotCert.Environment.PrivateIPAddress)
	}
	if cotCert.Environment.InstanceID != "test-instance-id" {
		t.Fatalf("Expected instanceId to be \"test-instance-id\" but was %v", cotCert.Environment.InstanceID)
	}
	if cotCert.Environment.InstanceType != "p3.enormous" {
		t.Fatalf("Expected instanceType to be \"p3.enormous\" but was %v", cotCert.Environment.InstanceType)
	}
	if cotCert.Environment.Region != "outer-space" {
		t.Fatalf("Expected region to be \"outer-space\" but was %v", cotCert.Environment.Region)
	}
}
