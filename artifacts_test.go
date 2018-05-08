package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"golang.org/x/crypto/openpgp"
	"golang.org/x/crypto/openpgp/clearsign"

	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
)

var (
	// all tests can share taskGroupId so we can view all test tasks in same
	// graph later for troubleshooting
	taskGroupID string = slugid.Nice()
)

func validateArtifacts(
	t *testing.T,
	payloadArtifacts []Artifact,
	expected []TaskArtifact) {

	// to test, create a dummy task run with given artifacts
	// and then call Artifacts() method to see what
	// artifacts would get uploaded...
	tr := &TaskRun{
		Payload: GenericWorkerPayload{
			Artifacts: []Artifact{},
		},
		Definition: tcqueue.TaskDefinitionResponse{
			Expires: inAnHour,
		},
	}
	for i := range payloadArtifacts {
		tr.Payload.Artifacts = append(tr.Payload.Artifacts, payloadArtifacts[i])
	}
	artifacts := tr.PayloadArtifacts()

	// compare expected vs actual artifacts by converting artifacts to strings...
	if fmt.Sprintf("%q", artifacts) != fmt.Sprintf("%q", expected) {
		t.Fatalf("Expected different artifacts to be generated...\nExpected:\n%q\nActual:\n%q", expected, artifacts)
	}
}

func TestFileArtifactWithNames(t *testing.T) {

	defer setup(t, "TestFileArtifactWithNames")()
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{
			{
				Expires: inAnHour,
				Path:    "SampleArtifacts/_/X.txt",
				Type:    "file",
				Name:    "public/build/firefox.exe",
			},
		},

		// what we expect to discover on file system
		[]TaskArtifact{
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:        "public/build/firefox.exe",
					Expires:     inAnHour,
					ContentType: "text/plain; charset=utf-8",
				},
				Path: "SampleArtifacts/_/X.txt",
			},
		})
}

func TestFileArtifactWithContentType(t *testing.T) {

	defer setup(t, "TestFileArtifactWithContentType")()
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{
			{
				Expires:     inAnHour,
				Path:        "SampleArtifacts/_/X.txt",
				Type:        "file",
				Name:        "public/build/firefox.exe",
				ContentType: "application/octet-stream",
			},
		},

		// what we expect to discover on file system
		[]TaskArtifact{
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:        "public/build/firefox.exe",
					Expires:     inAnHour,
					ContentType: "application/octet-stream",
				},
				Path: "SampleArtifacts/_/X.txt",
			},
		})
}

func TestDirectoryArtifactWithNames(t *testing.T) {

	defer setup(t, "TestDirectoryArtifactWithNames")()
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{
			{
				Expires: inAnHour,
				Path:    "SampleArtifacts",
				Type:    "directory",
				Name:    "public/b/c",
			},
		},

		// what we expect to discover on file system
		[]TaskArtifact{
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:        "public/b/c/%%%/v/X",
					Expires:     inAnHour,
					ContentType: "application/octet-stream",
				},
				Path: filepath.Join("SampleArtifacts", "%%%", "v", "X"),
			},
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:        "public/b/c/_/X.txt",
					Expires:     inAnHour,
					ContentType: "text/plain; charset=utf-8",
				},
				Path: filepath.Join("SampleArtifacts", "_", "X.txt"),
			},
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:        "public/b/c/b/c/d.jpg",
					Expires:     inAnHour,
					ContentType: "image/jpeg",
				},
				Path: filepath.Join("SampleArtifacts", "b", "c", "d.jpg"),
			},
		})
}

func TestDirectoryArtifactWithContentType(t *testing.T) {

	defer setup(t, "TestDirectoryArtifactWithContentType")()
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{
			{
				Expires:     inAnHour,
				Path:        "SampleArtifacts",
				Type:        "directory",
				Name:        "public/b/c",
				ContentType: "text/plain; charset=utf-8",
			},
		},

		// what we expect to discover on file system
		[]TaskArtifact{
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:        "public/b/c/%%%/v/X",
					Expires:     inAnHour,
					ContentType: "text/plain; charset=utf-8",
				},
				Path: filepath.Join("SampleArtifacts", "%%%", "v", "X"),
			},
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:        "public/b/c/_/X.txt",
					Expires:     inAnHour,
					ContentType: "text/plain; charset=utf-8",
				},
				Path: filepath.Join("SampleArtifacts", "_", "X.txt"),
			},
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:        "public/b/c/b/c/d.jpg",
					Expires:     inAnHour,
					ContentType: "text/plain; charset=utf-8",
				},
				Path: filepath.Join("SampleArtifacts", "b", "c", "d.jpg"),
			},
		})
}

// See the testdata/SampleArtifacts subdirectory of this project. This
// simulates adding it as a directory artifact in a task payload, and checks
// that all files underneath this directory are discovered and created as s3
// artifacts.
func TestDirectoryArtifacts(t *testing.T) {

	defer setup(t, "TestDirectoryArtifacts")()
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{{
			Expires: inAnHour,
			Path:    "SampleArtifacts",
			Type:    "directory",
		}},

		// what we expect to discover on file system
		[]TaskArtifact{
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:        "SampleArtifacts/%%%/v/X",
					Expires:     inAnHour,
					ContentType: "application/octet-stream",
				},
				Path: filepath.Join("SampleArtifacts", "%%%", "v", "X"),
			},
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:        "SampleArtifacts/_/X.txt",
					Expires:     inAnHour,
					ContentType: "text/plain; charset=utf-8",
				},
				Path: filepath.Join("SampleArtifacts", "_", "X.txt"),
			},
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:        "SampleArtifacts/b/c/d.jpg",
					Expires:     inAnHour,
					ContentType: "image/jpeg",
				},
				Path: filepath.Join("SampleArtifacts", "b", "c", "d.jpg"),
			},
		})
}

// Task payload specifies a file artifact which doesn't exist on worker
func TestMissingFileArtifact(t *testing.T) {

	defer setup(t, "TestMissingFileArtifact")()
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{{
			Expires: inAnHour,
			Path:    "TestMissingFileArtifact/no_such_file",
			Type:    "file",
		}},

		// what we expect to discover on file system
		[]TaskArtifact{
			&ErrorArtifact{
				BaseArtifact: &BaseArtifact{
					Name:    "TestMissingFileArtifact/no_such_file",
					Expires: inAnHour,
				},
				Path:    "TestMissingFileArtifact/no_such_file",
				Message: "Could not read file '" + filepath.Join(taskContext.TaskDir, "TestMissingFileArtifact", "no_such_file") + "'",
				Reason:  "file-missing-on-worker",
			},
		})
}

// Task payload specifies a directory artifact which doesn't exist on worker
func TestMissingDirectoryArtifact(t *testing.T) {

	defer setup(t, "TestMissingDirectoryArtifact")()
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{{
			Expires: inAnHour,
			Path:    "TestMissingDirectoryArtifact/no_such_dir",
			Type:    "directory",
		}},

		// what we expect to discover on file system
		[]TaskArtifact{
			&ErrorArtifact{
				BaseArtifact: &BaseArtifact{
					Name:    "TestMissingDirectoryArtifact/no_such_dir",
					Expires: inAnHour,
				},
				Path:    "TestMissingDirectoryArtifact/no_such_dir",
				Message: "Could not read directory '" + filepath.Join(taskContext.TaskDir, "TestMissingDirectoryArtifact", "no_such_dir") + "'",
				Reason:  "file-missing-on-worker",
			},
		})
}

// Task payload specifies a file artifact which is actually a directory on worker
func TestFileArtifactIsDirectory(t *testing.T) {

	defer setup(t, "TestFileArtifactIsDirectory")()
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{{
			Expires: inAnHour,
			Path:    "SampleArtifacts/b/c",
			Type:    "file",
		}},

		// what we expect to discover on file system
		[]TaskArtifact{
			&ErrorArtifact{
				BaseArtifact: &BaseArtifact{
					Name:    "SampleArtifacts/b/c",
					Expires: inAnHour,
				},
				Path:    "SampleArtifacts/b/c",
				Message: "File artifact '" + filepath.Join(taskContext.TaskDir, "SampleArtifacts", "b", "c") + "' exists as a directory, not a file, on the worker",
				Reason:  "invalid-resource-on-worker",
			},
		})
}

// TestDefaultArtifactExpiry tests that when providing no artifact expiry, task expiry is used
func TestDefaultArtifactExpiry(t *testing.T) {

	defer setup(t, "TestDefaultArtifactExpiry")()
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{{
			Path: "SampleArtifacts/b/c/d.jpg",
			Type: "file",
		}},

		// what we expect to discover on file system
		[]TaskArtifact{
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:        "SampleArtifacts/b/c/d.jpg",
					Expires:     inAnHour,
					ContentType: "image/jpeg",
				},
				Path: "SampleArtifacts/b/c/d.jpg",
			},
		},
	)
}

// Task payload specifies a directory artifact which is a regular file on worker
func TestDirectoryArtifactIsFile(t *testing.T) {

	defer setup(t, "TestDirectoryArtifactIsFile")()
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{{
			Expires: inAnHour,
			Path:    "SampleArtifacts/b/c/d.jpg",
			Name:    "SampleArtifacts/b/c/d.jpg",
			Type:    "directory",
		}},

		// what we expect to discover on file system
		[]TaskArtifact{
			&ErrorArtifact{
				BaseArtifact: &BaseArtifact{
					Name:    "SampleArtifacts/b/c/d.jpg",
					Expires: inAnHour,
				},
				Path:    "SampleArtifacts/b/c/d.jpg",
				Message: "Directory artifact '" + filepath.Join(taskContext.TaskDir, "SampleArtifacts", "b", "c", "d.jpg") + "' exists as a file, not a directory, on the worker",
				Reason:  "invalid-resource-on-worker",
			},
		})
}

func TestMissingArtifactFailsTest(t *testing.T) {

	defer setup(t, "TestMissingArtifactFailsTest")()

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	payload := GenericWorkerPayload{
		Command:    append(helloGoodbye()),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:    "Nonexistent/art i fact.txt",
				Expires: expires,
				Type:    "file",
			},
		},
	}

	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

func TestProtectedArtifactsReplaced(t *testing.T) {
	defer setup(t, "TestProtectedArtifactsReplaced")()

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()
	command = append(command, copyArtifactTo("SampleArtifacts/_/X.txt", "public/logs/live.log")...)
	command = append(command, copyArtifactTo("SampleArtifacts/_/X.txt", "public/logs/live_backing.log")...)
	command = append(command, copyArtifactTo("SampleArtifacts/_/X.txt", "public/logs/certified.log")...)
	command = append(command, copyArtifactTo("SampleArtifacts/_/X.txt", "public/chainOfTrust.json.asc")...)
	command = append(command, copyArtifactTo("SampleArtifacts/_/X.txt", "public/X.txt")...)
	command = append(command, copyArtifactTo("SampleArtifacts/_/X.txt", "public/Y.txt")...)

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
				Path:    "public/chainOfTrust.json.asc",
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

	if l := len(artifacts.Artifacts); l != 6 {
		t.Fatalf("Was expecting 5 artifacts, but got %v", l)
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
		"public/chainOfTrust.json.asc",
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

func TestPublicDirectoryArtifact(t *testing.T) {
	defer setup(t, "TestPublicDirectoryArtifact")()

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()
	command = append(command, copyArtifactTo("SampleArtifacts/_/X.txt", "public/build/X.txt")...)

	payload := GenericWorkerPayload{
		Command:    command,
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:    "public",
				Expires: expires,
				Type:    "directory",
			},
		},
	}
	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	artifacts, err := testQueue.ListArtifacts(taskID, "0", "", "")

	if err != nil {
		t.Fatalf("Error listing artifacts: %v", err)
	}

	if l := len(artifacts.Artifacts); l != 3 {
		t.Fatalf("Was expecting 3 artifacts, but got %v", l)
	}

	// use the artifact names as keys in a map, so we can look up that each key exists
	a := map[string]bool{
		artifacts.Artifacts[0].Name: true,
		artifacts.Artifacts[1].Name: true,
		artifacts.Artifacts[2].Name: true,
	}

	if !a["public/build/X.txt"] || !a["public/logs/live.log"] || !a["public/logs/live_backing.log"] {
		t.Fatalf("Wrong artifacts presented in task %v", taskID)
	}
}

func TestConflictingFileArtifactsInPayload(t *testing.T) {
	defer setup(t, "TestConflictingFileArtifactsInPayload")()

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()
	command = append(command, copyArtifact("SampleArtifacts/_/X.txt")...)
	command = append(command, copyArtifact("SampleArtifacts/b/c/d.jpg")...)

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
				Name:    "public/build/X.txt",
			},
		},
	}
	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "exception", "malformed-payload")

	artifacts, err := testQueue.ListArtifacts(taskID, "0", "", "")

	if err != nil {
		t.Fatalf("Error listing artifacts: %v", err)
	}

	if l := len(artifacts.Artifacts); l != 3 {
		t.Fatalf("Was expecting 3 artifacts, but got %v", l)
	}

	// use the artifact names as keys in a map, so we can look up that each key exists
	a := map[string]bool{
		artifacts.Artifacts[0].Name: true,
		artifacts.Artifacts[1].Name: true,
		artifacts.Artifacts[2].Name: true,
	}

	if !a["public/build/X.txt"] || !a["public/logs/live.log"] || !a["public/logs/live_backing.log"] {
		t.Fatalf("Wrong artifacts presented in task %v", taskID)
	}
}

func TestFileArtifactTwiceInPayload(t *testing.T) {
	defer setup(t, "TestFileArtifactTwiceInPayload")()

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()
	command = append(command, copyArtifact("SampleArtifacts/_/X.txt")...)

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
				Path:    "SampleArtifacts/_/X.txt",
				Expires: expires,
				Type:    "file",
				Name:    "public/build/X.txt",
			},
		},
	}
	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	artifacts, err := testQueue.ListArtifacts(taskID, "0", "", "")

	if err != nil {
		t.Fatalf("Error listing artifacts: %v", err)
	}

	if l := len(artifacts.Artifacts); l != 3 {
		t.Fatalf("Was expecting 3 artifacts, but got %v", l)
	}

	// use the artifact names as keys in a map, so we can look up that each key exists
	a := map[string]bool{
		artifacts.Artifacts[0].Name: true,
		artifacts.Artifacts[1].Name: true,
		artifacts.Artifacts[2].Name: true,
	}

	if !a["public/build/X.txt"] || !a["public/logs/live.log"] || !a["public/logs/live_backing.log"] {
		t.Fatalf("Wrong artifacts presented in task %v", taskID)
	}
}

func TestArtifactIncludedAsFileAndDirectoryInPayload(t *testing.T) {
	defer setup(t, "TestArtifactIncludedAsFileAndDirectoryInPayload")()

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()
	command = append(command, copyArtifact("SampleArtifacts/_/X.txt")...)

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
				Path:    "SampleArtifacts/_",
				Expires: expires,
				Type:    "directory",
				Name:    "public/build",
			},
		},
	}
	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	artifacts, err := testQueue.ListArtifacts(taskID, "0", "", "")

	if err != nil {
		t.Fatalf("Error listing artifacts: %v", err)
	}

	if l := len(artifacts.Artifacts); l != 3 {
		t.Fatalf("Was expecting 3 artifacts, but got %v", l)
	}

	// use the artifact names as keys in a map, so we can look up that each key exists
	a := map[string]bool{
		artifacts.Artifacts[0].Name: true,
		artifacts.Artifacts[1].Name: true,
		artifacts.Artifacts[2].Name: true,
	}

	if !a["public/build/X.txt"] || !a["public/logs/live.log"] || !a["public/logs/live_backing.log"] {
		t.Fatalf("Wrong artifacts presented in task %v", taskID)
	}
}

func TestUpload(t *testing.T) {

	defer setup(t, "TestUpload")()

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()
	command = append(command, copyArtifact("SampleArtifacts/_/X.txt")...)
	command = append(command, copyArtifact("SampleArtifacts/b/c/d.jpg")...)

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
		"public/chainOfTrust.json.asc": {
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
			ContentEncoding: "", // jpg files are blacklisted against gzip compression
			Expires:         payload.Artifacts[0].Expires,
		},
	}

	expectedArtifacts.Validate(t, taskID, 0)

	// check openpgp signature is valid
	b, _, _, _ := getArtifactContent(t, taskID, "public/chainOfTrust.json.asc")
	if len(b) == 0 {
		t.Fatalf("Could not retrieve content of public/chainOfTrust.json.asc")
	}
	pubKey, err := os.Open(filepath.Join("testdata", "public-openpgp-key"))
	if err != nil {
		t.Fatalf("Error opening public key file")
	}
	defer pubKey.Close()
	entityList, err := openpgp.ReadArmoredKeyRing(pubKey)
	if err != nil {
		t.Fatalf("Error decoding public key file")
	}
	block, _ := clearsign.Decode(b)

	// signer of public/chainOfTrust.json.asc
	signer, err := openpgp.CheckDetachedSignature(entityList, bytes.NewBuffer(block.Bytes), block.ArmoredSignature.Body)
	if err != nil {
		t.Fatalf("Not able to validate openpgp signature of public/chainOfTrust.json.asc")
	}
	var cotCert ChainOfTrustData
	err = json.Unmarshal(block.Plaintext, &cotCert)
	if err != nil {
		t.Fatalf("Could not interpret public/chainOfTrust.json as json")
	}
	if signer.Identities["Generic-Worker <taskcluster-accounts+gpgsigning@mozilla.com>"] == nil {
		t.Fatalf("Did not get correct signer identity in public/chainOfTrust.json.asc - %#v", signer.Identities)
	}

	// This trickery is to convert a TaskDefinitionResponse into a
	// TaskDefinitionRequest in order that we can compare. We cannot cast, so
	// need to transform to json as an intermediary step.
	b, err = json.Marshal(cotCert.Task)
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
		"public/logs/live.log":         true,
		"public/logs/live_backing.log": true,
		"public/chainOfTrust.json.asc": true,
	}
	for artifactName := range expectedArtifacts {
		if _, inBlacklist := blacklist[artifactName]; !inBlacklist {
			if _, inCotManifest := cotCert.Artifacts[artifactName]; !inCotManifest {
				t.Fatalf("Artifact not listed in chain of trust manifest: %v", artifactName)
			}
		}
	}
}

func TestFileArtifactHasNoExpiry(t *testing.T) {

	defer setup(t, "TestFileArtifactHasNoExpiry")()

	payload := GenericWorkerPayload{
		Command:    copyArtifact("SampleArtifacts/_/X.txt"),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path: "SampleArtifacts/_/X.txt",
				Type: "file",
				Name: "public/build/firefox.exe",
			},
		},
	}

	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")
	// check artifact expiry matches task expiry
	lar, err := testQueue.ListArtifacts(taskID, "0", "", "")
	if err != nil {
		t.Fatalf("Error listing artifacts of task %v: %v", taskID, err)
	}
	t.Logf("Task expires: %v", td.Expires.String())
	for _, artifact := range lar.Artifacts {
		t.Logf("Artifact name: '%v', content type: '%v', expires: %v, storage type: '%v'", artifact.Name, artifact.ContentType, artifact.Expires, artifact.StorageType)
		if artifact.Name == "public/build/firefox.exe" {
			if artifact.Expires.String() == td.Expires.String() {
				return
			}
			t.Fatalf("Expiry of public/build/firefox.exe in task %v is %v but should be %v", taskID, artifact.Expires, td.Expires)
		}
	}
	t.Fatalf("Could not find artifact public/build/firefox.exe in task run 0 of task %v", taskID)
}

func TestDirectoryArtifactHasNoExpiry(t *testing.T) {

	defer setup(t, "TestDirectoryArtifactHasNoExpiry")()

	payload := GenericWorkerPayload{
		Command:    copyArtifact("SampleArtifacts/_/X.txt"),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path: "SampleArtifacts/_",
				Type: "directory",
				Name: "public/build",
			},
		},
	}

	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")
	// check artifact expiry matches task expiry
	lar, err := testQueue.ListArtifacts(taskID, "0", "", "")
	if err != nil {
		t.Fatalf("Error listing artifacts of task %v: %v", taskID, err)
	}
	t.Logf("Task expires: %v", td.Expires.String())
	for _, artifact := range lar.Artifacts {
		t.Logf("Artifact name: '%v', content type: '%v', expires: %v, storage type: '%v'", artifact.Name, artifact.ContentType, artifact.Expires, artifact.StorageType)
		if artifact.Name == "public/build/X.txt" {
			if artifact.Expires.String() == td.Expires.String() {
				return
			}
			t.Fatalf("Expiry of public/build/X.txt in task %v is %v but should be %v", taskID, artifact.Expires, td.Expires)
		}
	}
	t.Fatalf("Could not find artifact public/build/X.txt in task run 0 of task %v", taskID)
}
