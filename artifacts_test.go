package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster-client-go/queue"
)

var expiry queue.Time

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
