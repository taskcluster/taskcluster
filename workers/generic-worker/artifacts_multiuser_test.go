// +build multiuser

package main

import (
	"encoding/base64"
	"encoding/json"
	"io/ioutil"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
	"golang.org/x/crypto/ed25519"
)

func TestChainOfTrustUpload(t *testing.T) {

	defer setup(t)()

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()
	command = append(command, copyTestdataFile("SampleArtifacts/_/X.txt")...)
	command = append(command, copyTestdataFile("SampleArtifacts/b/c/d.jpg")...)

	payload := GenericWorkerPayload{
		Command:    command,
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:    "SampleArtifacts/_/X.txt",
				Expires: expires,
				Type:    "file",
				Name:    "public/build/X.txt",
			},
			{
				Path:    "SampleArtifacts/b/c/d.jpg",
				Expires: expires,
				Type:    "file",
			},
		},
		Features: FeatureFlags{
			ChainOfTrust: true,
		},
	}
	td := testTask(t)

	// Chain of trust is not allowed when running as current user
	// since signing key cannot be secured
	if config.RunTasksAsCurrentUser {
		expectChainOfTrustKeyNotSecureMessage(t, td, payload)
		return
	}

	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	// some required substrings - not all, just a selection
	expectedArtifacts := ExpectedArtifacts{
		"public/logs/live_backing.log": {
			Extracts: []string{
				"hello world!",
				"goodbye world!",
				`"instance-type": "p3.enormous"`,
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
			Expires:         td.Expires,
		},
		"public/logs/live.log": {
			Extracts: []string{
				"hello world!",
				"goodbye world!",
				"=== Task Finished ===",
				"Exit Code: 0",
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
			Expires:         td.Expires,
		},
		"public/logs/certified.log": {
			Extracts: []string{
				"hello world!",
				"goodbye world!",
				"=== Task Finished ===",
				"Exit Code: 0",
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
			Expires:         td.Expires,
		},
		"public/chain-of-trust.json": {
			// e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  ./%%%/v/X
			// 8308d593eb56527137532595a60255a3fcfbe4b6b068e29b22d99742bad80f6f  ./_/X.txt
			// a0ed21ab50992121f08da55365da0336062205fd6e7953dbff781a7de0d625b7  ./b/c/d.jpg
			Extracts: []string{
				"8308d593eb56527137532595a60255a3fcfbe4b6b068e29b22d99742bad80f6f",
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
			Expires:         td.Expires,
		},
		"public/chain-of-trust.json.sig": {
			ContentType:     "application/octet-stream",
			ContentEncoding: "gzip",
			Expires:         td.Expires,
		},
		"public/build/X.txt": {
			Extracts: []string{
				"test artifact",
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
			Expires:         payload.Artifacts[0].Expires,
		},
		"SampleArtifacts/b/c/d.jpg": {
			Extracts:        []string{},
			ContentType:     "image/jpeg",
			ContentEncoding: "identity", // jpg files are blacklisted against gzip compression
			Expires:         payload.Artifacts[0].Expires,
		},
	}

	expectedArtifacts.Validate(t, taskID, 0)

	cotUnsignedBytes, _, _, _ := getArtifactContent(t, taskID, "public/chain-of-trust.json")
	var cotCert ChainOfTrustData
	err := json.Unmarshal(cotUnsignedBytes, &cotCert)
	if err != nil {
		t.Fatalf("Could not interpret public/chain-of-trust.json as json")
	}
	cotSignature, _, _, _ := getArtifactContent(t, taskID, "public/chain-of-trust.json.sig")
	var ed25519Pubkey ed25519.PublicKey
	base64Ed25519Pubkey, err := ioutil.ReadFile(filepath.Join("testdata", "ed25519_public_key"))
	if err != nil {
		t.Fatalf("Error opening ed25519 public key file")
	}
	ed25519Pubkey, err = base64.StdEncoding.DecodeString(string(base64Ed25519Pubkey))
	if err != nil {
		t.Fatalf("Error converting ed25519 public key to a valid pubkey")
	}
	ed25519Verified := ed25519.Verify(ed25519Pubkey, cotUnsignedBytes, cotSignature)
	if ed25519Verified != true {
		t.Fatalf("Could not verify public/chain-of-trust.json.sig signature against public/chain-of-trust.json")
	}

	// This trickery is to convert a TaskDefinitionResponse into a
	// TaskDefinitionRequest in order that we can compare. We cannot cast, so
	// need to transform to json as an intermediary step.
	b, err := json.Marshal(cotCert.Task)
	if err != nil {
		t.Fatalf("Cannot marshal task into json - %#v\n%v", cotCert.Task, err)
	}
	cotCertTaskRequest := &tcqueue.TaskDefinitionRequest{}
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
	if len(cotCert.Artifacts) != 3 {
		t.Fatalf("Expected 3 artifact hashes to be listed, but found %v", len(cotCert.Artifacts))
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
	if cotCert.Environment.Region != "test-worker-group" {
		t.Fatalf("Expected region to be \"test-worker-group\" but was %v", cotCert.Environment.Region)
	}

	// Check artifact list in CoT includes the names (not paths) of all
	// expected artifacts...

	// blacklist is for artifacts that by design should not be included in
	// chain of trust artifact list
	blacklist := map[string]bool{
		"public/logs/live.log":           true,
		"public/logs/live_backing.log":   true,
		"public/chain-of-trust.json":     true,
		"public/chain-of-trust.json.sig": true,
	}
	for artifactName := range expectedArtifacts {
		if _, inBlacklist := blacklist[artifactName]; !inBlacklist {
			if _, inCotManifest := cotCert.Artifacts[artifactName]; !inCotManifest {
				t.Fatalf("Artifact not listed in chain of trust manifest: %v", artifactName)
			}
		}
	}
}

func TestProtectedArtifactsReplaced(t *testing.T) {
	defer setup(t)()

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()
	command = append(command, copyTestdataFileTo("SampleArtifacts/_/X.txt", "public/logs/live.log")...)
	command = append(command, copyTestdataFileTo("SampleArtifacts/_/X.txt", "public/logs/live_backing.log")...)
	command = append(command, copyTestdataFileTo("SampleArtifacts/_/X.txt", "public/logs/certified.log")...)
	command = append(command, copyTestdataFileTo("SampleArtifacts/_/X.txt", "public/chain-of-trust.json")...)
	command = append(command, copyTestdataFileTo("SampleArtifacts/_/X.txt", "public/chain-of-trust.json.sig")...)
	command = append(command, copyTestdataFileTo("SampleArtifacts/_/X.txt", "public/X.txt")...)
	command = append(command, copyTestdataFileTo("SampleArtifacts/_/X.txt", "public/Y.txt")...)

	payload := GenericWorkerPayload{
		Command:    command,
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:    "public/logs/live.log",
				Expires: expires,
				Type:    "file",
			},
			{
				Path:    "public/logs/live_backing.log",
				Expires: expires,
				Type:    "file",
			},
			{
				Path:    "public/logs/certified.log",
				Expires: expires,
				Type:    "file",
			},
			{
				Path:    "public/chain-of-trust.json",
				Expires: expires,
				Type:    "file",
			},
			{
				Path:    "public/chain-of-trust.json.sig",
				Expires: expires,
				Type:    "file",
			},
			{
				Path:    "public/X.txt",
				Expires: expires,
				Type:    "file",
			},
			{
				Path:    "public/Y.txt",
				Expires: expires,
				Type:    "file",
			},
		},
		Features: FeatureFlags{
			ChainOfTrust: true,
		},
	}
	td := testTask(t)

	// Chain of trust is not allowed when running as current user
	// since signing key cannot be secured
	if config.RunTasksAsCurrentUser {
		expectChainOfTrustKeyNotSecureMessage(t, td, payload)
		return
	}

	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	artifacts, err := testQueue.ListArtifacts(taskID, "0", "", "")

	if err != nil {
		t.Fatalf("Error listing artifacts: %v", err)
	}

	if l := len(artifacts.Artifacts); l != 7 {
		t.Fatalf("Was expecting 7 artifacts, but got %v", l)
	}

	// use the artifact names as keys in a map, so we can look up that each key exists
	a := map[string]bool{}
	for _, j := range artifacts.Artifacts {
		a[j.Name] = true
	}

	x, _, _, _ := getArtifactContent(t, taskID, "public/X.txt")
	y, _, _, _ := getArtifactContent(t, taskID, "public/Y.txt")

	if string(x) != string(y) {
		t.Fatalf("Artifacts X.txt and Y.txt should have identical content in task %v, but they do not", taskID)
	}

	for _, artifactName := range []string{
		"public/logs/live.log",
		"public/logs/live_backing.log",
		"public/logs/certified.log",
		"public/chain-of-trust.json",
		"public/chain-of-trust.json.sig",
	} {
		if !a[artifactName] {
			t.Fatalf("Artifact %v missing in task %v", artifactName, taskID)
		}
		// make sure artifact content isn't from copied file
		b, _, _, _ := getArtifactContent(t, taskID, artifactName)
		if string(b) == string(x) {
			t.Fatalf("Protected artifact %v seems to have overridden content from X.txt in task %v", artifactName, taskID)
		}
	}
}
