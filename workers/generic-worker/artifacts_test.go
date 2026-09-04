package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster/v108/clients/client-go"
	"github.com/taskcluster/taskcluster/v108/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/artifacts"
)

var (
	// all tests can share taskGroupId so we can view all test tasks in same
	// graph later for troubleshooting
	taskGroupID = slugid.Nice()
)

func validateArtifacts(t *testing.T, payloadArtifacts []Artifact, expected []artifacts.TaskArtifact) {

	t.Helper()
	payload := GenericWorkerPayload{
		Artifacts: []Artifact{},
	}
	defaults.SetDefaults(&payload)

	// Get platform data for the test context
	pd, err := platformDataForTaskContext(taskContext)
	if err != nil {
		t.Fatalf("Failed to get platform data: %v", err)
	}

	// to test, create a dummy task run with given artifacts
	// and then call Artifacts() method to see what
	// artifacts would get uploaded...
	tr := &TaskRun{
		Payload: payload,
		Definition: tcqueue.TaskDefinitionResponse{
			Expires: inAnHour,
		},
		pd:      pd,
		Context: taskContext,
	}
	tr.Payload.Artifacts = append(tr.Payload.Artifacts, payloadArtifacts...)
	atf := ArtifactTaskFeature{
		task: tr,
	}
	atf.FindArtifacts()
	got := atf.artifacts

	// remove the ContentPath field from the got artifacts, we can't
	// compare it as it's non-deterministic
	for _, a := range got {
		switch artifact := a.(type) {
		case *artifacts.S3Artifact:
			artifact.ContentPath = ""
		case *artifacts.ObjectArtifact:
			artifact.ContentPath = ""
		}
	}

	if !reflect.DeepEqual(got, expected) {
		t.Fatalf("Expected different artifacts to be generated...\nExpected:\n%q\nActual:\n%q", expected, got)
	}
}

func TestFileArtifactWithNames(t *testing.T) {

	setup(t)
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
		[]artifacts.TaskArtifact{
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/build/firefox.exe",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				ContentLength:   14,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "_", "X.txt"),
			},
		})
}

func TestFileArtifactWithContentType(t *testing.T) {

	setup(t)
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
		[]artifacts.TaskArtifact{
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/build/firefox.exe",
					Expires: inAnHour,
				},
				ContentType:     "application/octet-stream",
				ContentEncoding: "gzip",
				ContentLength:   14,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "_", "X.txt"),
			},
		})
}

func TestFileArtifactWithJSONLContentType(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload - note: no ContentType, so the worker
		// must guess it from the .jsonl extension via customMimeMappings
		[]Artifact{
			{
				Expires: inAnHour,
				Path:    "SampleArtifactsExtra/sample.jsonl",
				Type:    "file",
				Name:    "public/logs/sample.jsonl",
			},
		},

		// what we expect to discover on file system
		[]artifacts.TaskArtifact{
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/logs/sample.jsonl",
					Expires: inAnHour,
				},
				ContentType:     "application/jsonl",
				ContentEncoding: "gzip",
				ContentLength:   16,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifactsExtra", "sample.jsonl"),
			},
		})
}

func TestFileArtifactAsObjectWithContentType(t *testing.T) {

	setup(t)
	config.CreateObjectArtifacts = true
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
		[]artifacts.TaskArtifact{
			&artifacts.ObjectArtifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/build/firefox.exe",
					Expires: inAnHour,
				},
				ContentType:   "application/octet-stream",
				ContentLength: 14,
				Path:          filepath.Join(taskContext.TaskDir, "SampleArtifacts", "_", "X.txt"),
			},
		})
}

func TestFileArtifactWithContentEncoding(t *testing.T) {
	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{
			{
				Expires:     inAnHour,
				Path:        "SampleArtifacts/_/X.txt",
				Type:        "file",
				Name:        "public/_/X.txt",
				ContentType: "text/plain; charset=utf-8",
			},
			{
				Expires:     inAnHour,
				Path:        "SampleArtifacts/b/c/d.jpg",
				Type:        "file",
				Name:        "public/b/c/d.jpg",
				ContentType: "image/jpeg",
			},
			{
				Expires:         inAnHour,
				Path:            "SampleArtifacts/_/X.txt",
				Type:            "file",
				Name:            "public/_/X.txt",
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "identity",
			},
			{
				Expires:         inAnHour,
				Path:            "SampleArtifacts/b/c/d.jpg",
				Type:            "file",
				Name:            "public/b/c/d.jpg",
				ContentType:     "image/jpeg",
				ContentEncoding: "identity",
			},
			{
				Expires:         inAnHour,
				Path:            "SampleArtifacts/_/X.txt",
				Type:            "file",
				Name:            "public/_/X.txt",
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
			},
			{
				Expires:         inAnHour,
				Path:            "SampleArtifacts/b/c/d.jpg",
				Type:            "file",
				Name:            "public/b/c/d.jpg",
				ContentType:     "image/jpeg",
				ContentEncoding: "gzip",
			},
		},

		// what we expect to discover on file system
		[]artifacts.TaskArtifact{
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/_/X.txt",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				ContentLength:   14,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "_", "X.txt"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/_/X.txt",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				ContentLength:   14,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "_", "X.txt"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/_/X.txt",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "identity",
				ContentLength:   14,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "_", "X.txt"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/d.jpg",
					Expires: inAnHour,
				},
				ContentType:     "image/jpeg",
				ContentEncoding: "gzip",
				ContentLength:   17,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "b", "c", "d.jpg"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/d.jpg",
					Expires: inAnHour,
				},
				ContentType:     "image/jpeg",
				ContentEncoding: "identity",
				ContentLength:   17,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "b", "c", "d.jpg"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/d.jpg",
					Expires: inAnHour,
				},
				ContentType:     "image/jpeg",
				ContentEncoding: "identity",
				ContentLength:   17,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "b", "c", "d.jpg"),
			},
		})
}

func TestDirectoryArtifactWithNames(t *testing.T) {

	setup(t)
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
		[]artifacts.TaskArtifact{
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/%%%/v/X",
					Expires: inAnHour,
				},
				ContentType:     "application/octet-stream",
				ContentEncoding: "gzip",
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "%%%", "v", "X"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/_/X.txt",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				ContentLength:   14,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "_", "X.txt"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/b/c/d.jpg",
					Expires: inAnHour,
				},
				ContentType:     "image/jpeg",
				ContentEncoding: "identity",
				ContentLength:   17,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "b", "c", "d.jpg"),
			},
		})
}

func TestDirectoryArtifactWithContentType(t *testing.T) {

	setup(t)
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
		[]artifacts.TaskArtifact{
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/%%%/v/X",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "%%%", "v", "X"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/_/X.txt",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				ContentLength:   14,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "_", "X.txt"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/b/c/d.jpg",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "identity",
				ContentLength:   17,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "b", "c", "d.jpg"),
			},
		})
}

func TestDirectoryArtifactWithContentEncoding(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{
			{
				Expires:         inAnHour,
				Path:            "SampleArtifacts",
				Type:            "directory",
				Name:            "public/b/c",
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "identity",
			},
			{
				Expires:         inAnHour,
				Path:            "SampleArtifacts",
				Type:            "directory",
				Name:            "public/b/c",
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
			},
		},

		// what we expect to discover on file system
		[]artifacts.TaskArtifact{
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/%%%/v/X",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "%%%", "v", "X"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/%%%/v/X",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "identity",
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "%%%", "v", "X"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/_/X.txt",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				ContentLength:   14,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "_", "X.txt"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/_/X.txt",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "identity",
				ContentLength:   14,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "_", "X.txt"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/b/c/d.jpg",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				ContentLength:   17,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "b", "c", "d.jpg"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/b/c/b/c/d.jpg",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "identity",
				ContentLength:   17,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "b", "c", "d.jpg"),
			},
		})
}

// See the testdata/SampleArtifacts subdirectory of this project. This
// simulates adding it as a directory artifact in a task payload, and checks
// that all files underneath this directory are discovered and created as s3
// artifacts.
func TestDirectoryArtifacts(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{{
			Expires: inAnHour,
			Path:    "SampleArtifacts",
			Type:    "directory",
		}},

		// what we expect to discover on file system
		[]artifacts.TaskArtifact{
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "SampleArtifacts/%%%/v/X",
					Expires: inAnHour,
				},
				ContentType:     "application/octet-stream",
				ContentEncoding: "gzip",
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "%%%", "v", "X"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "SampleArtifacts/_/X.txt",
					Expires: inAnHour,
				},
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "gzip",
				ContentLength:   14,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "_", "X.txt"),
			},
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "SampleArtifacts/b/c/d.jpg",
					Expires: inAnHour,
				},
				ContentType:     "image/jpeg",
				ContentEncoding: "identity",
				ContentLength:   17,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "b", "c", "d.jpg"),
			},
		})
}

// Task payload specifies a file artifact which doesn't exist on worker
func TestMissingFileArtifact(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{{
			Expires: inAnHour,
			Path:    t.Name() + "/no_such_file",
			Type:    "file",
		}},

		// what we expect to discover on file system
		[]artifacts.TaskArtifact{
			&artifacts.ErrorArtifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    t.Name() + "/no_such_file",
					Expires: inAnHour,
				},
				Path:    t.Name() + "/no_such_file",
				Message: "Could not read file '" + filepath.Join(taskContext.TaskDir, t.Name(), "no_such_file") + "'",
				Reason:  "file-missing-on-worker",
			},
		})
}

// Task payload specifies a directory artifact which doesn't exist on worker
func TestMissingDirectoryArtifact(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{{
			Expires: inAnHour,
			Path:    t.Name() + "/no_such_dir",
			Type:    "directory",
		}},

		// what we expect to discover on file system
		[]artifacts.TaskArtifact{
			&artifacts.ErrorArtifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    t.Name() + "/no_such_dir",
					Expires: inAnHour,
				},
				Path:    t.Name() + "/no_such_dir",
				Message: "Could not read directory '" + filepath.Join(taskContext.TaskDir, t.Name(), "no_such_dir") + "'",
				Reason:  "file-missing-on-worker",
			},
		})
}

// Task payload specifies a file artifact which is actually a directory on worker
func TestFileArtifactIsDirectory(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{{
			Expires: inAnHour,
			Path:    "SampleArtifacts/b/c",
			Type:    "file",
		}},

		// what we expect to discover on file system
		[]artifacts.TaskArtifact{
			&artifacts.ErrorArtifact{
				BaseArtifact: &artifacts.BaseArtifact{
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

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{{
			Path: "SampleArtifacts/b/c/d.jpg",
			Type: "file",
		}},

		// what we expect to discover on file system
		[]artifacts.TaskArtifact{
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "SampleArtifacts/b/c/d.jpg",
					Expires: inAnHour,
				},
				ContentType:     "image/jpeg",
				ContentEncoding: "identity",
				ContentLength:   17,
				Path:            filepath.Join(taskContext.TaskDir, "SampleArtifacts", "b", "c", "d.jpg"),
			},
		},
	)
}

// Task payload specifies a directory artifact which is a regular file on worker
func TestDirectoryArtifactIsFile(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{{
			Expires: inAnHour,
			Path:    "SampleArtifacts/b/c/d.jpg",
			Name:    "SampleArtifacts/b/c/d.jpg",
			Type:    "directory",
		}},

		// what we expect to discover on file system
		[]artifacts.TaskArtifact{
			&artifacts.ErrorArtifact{
				BaseArtifact: &artifacts.BaseArtifact{
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

	setup(t)

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:    "Nonexistent/art i fact.txt",
				Expires: expires,
				Type:    "file",
			},
		},
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

func TestMissingOptionalFileArtifactDoesNotFailTest(t *testing.T) {

	setup(t)

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:     "Nonexistent/artifact.txt",
				Expires:  expires,
				Type:     "file",
				Optional: true,
			},
		},
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")
	expectedArtifacts := ExpectedArtifacts{
		"Nonexistent/artifact.txt": {
			StorageType:      "error",
			SkipContentCheck: true,
		},
		"public/logs/live_backing.log": {
			Extracts: []string{
				"hello world!",
				"goodbye world!",
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
	}
	expectedArtifacts.Validate(t, taskID, 0)
}

func TestOptionalArtifactUploadFailureFailsTask(t *testing.T) {
	if os.Getenv("GW_TESTS_USE_EXTERNAL_TASKCLUSTER") != "" {
		t.Skip("This test requires mock services")
	}

	setup(t)

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))
	payload := GenericWorkerPayload{
		Command:    copyTestdataFile("SampleArtifacts/_/X.txt"),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:     "SampleArtifacts/_/X.txt",
				Expires:  expires,
				Type:     "file",
				Name:     "public/fail-with-403/X.txt",
				Optional: true,
			},
		},
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)
	_ = submitAndAssert(t, td, payload, "exception", "resource-unavailable")
}

// TestInvalidArtifactNameFailsAsMalformedPayload verifies that an artifact
// name which doesn't match the pattern the Queue enforces is now caught by
// generic-worker's own payload schema validation, failing the task
// immediately as malformed-payload rather than running to completion.
// See https://github.com/taskcluster/taskcluster/issues/9007
func TestInvalidArtifactNameFailsAsMalformedPayload(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    copyTestdataFile("SampleArtifacts/_/X.txt"),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path: "SampleArtifacts/_/X.txt",
				Type: "file",
				Name: "public/logs/a\nb.log",
			},
		},
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}

// TestClassifyCreateArtifactError4xxIsMalformedPayload unit tests
// classifyCreateArtifactError directly, to verify that a 4xx response from
// the Queue's CreateArtifact endpoint is classified as malformed-payload
// rather than causing an unrecovered panic.
// See https://github.com/taskcluster/taskcluster/issues/9007
func TestClassifyCreateArtifactError4xxIsMalformedPayload(t *testing.T) {
	setup(t)

	scheduleTask(t, testTask(t), GenericWorkerPayload{})

	// need to claim task directly to get task.StatusManager wired up
	tasks := ClaimWork(1)
	if len(tasks) != 1 {
		t.Fatalf("Expected to claim 1 task, got %v", len(tasks))
	}
	task := tasks[0]

	artifact := &artifacts.S3Artifact{
		BaseArtifact: &artifacts.BaseArtifact{
			Name: "public/build/firefox.exe",
		},
	}

	cee := task.classifyCreateArtifactError(artifact, []byte("{}"), &tcclient.APICallException{
		CallSummary: &tcclient.CallSummary{
			HTTPResponseBody: "some 4xx error the schema didn't anticipate",
		},
		RootCause: httpbackoff.BadHttpResponseCode{
			// an arbitrary, unassigned 4xx code (i.e. not 400/404/409/etc,
			// which might coincidentally be handled by a more specific
			// branch) to prove the generic "any 4xx" fallback is exercised
			HttpResponseCode: 456,
		},
	})

	if cee == nil {
		t.Fatal("Expected classifyCreateArtifactError to return a malformed-payload error, but got nil")
	}
	if cee.Reason != malformedPayload {
		t.Fatalf("Expected reason %q, got %q", malformedPayload, cee.Reason)
	}
	if cee.TaskStatus != errored {
		t.Fatalf("Expected task status %q, got %q", errored, cee.TaskStatus)
	}
}

// TestPathDerivedArtifactNameRejectedByQueue verifies the end-to-end case
// classifyCreateArtifactError's 4xx handling exists for: when name is not
// set and path contains characters outside the printable ASCII range, the
// payload schema (which only restricts an explicit name, not path - path
// and artifact name have different character restrictions) lets the task
// run, but the Queue rejects the resulting derived name at upload time.
// The task must resolve as malformed-payload, not complete successfully or
// panic.
// See https://github.com/taskcluster/taskcluster/issues/9007
func TestPathDerivedArtifactNameRejectedByQueue(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    copyTestdataFileTo("SampleArtifacts/_/X.txt", "unzulässiges-Zeichen.txt"),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path: "unzulässiges-Zeichen.txt",
				Type: "file",
			},
		},
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, "TASK EXCEPTION due to response code 400 from Queue") {
		t.Fatalf("Was expecting log to show the Queue's 400 rejection of the path-derived artifact name, but it doesn't: \n%v", logtext)
	}
}

// TestClassifyCreateArtifactError401And403Panic verifies that 401/403
// responses are NOT classified as malformed-payload: they indicate a
// worker/credentials problem rather than something wrong with the task
// payload, so they fall through to the panic instead.
// See https://github.com/taskcluster/taskcluster/issues/9007
func TestClassifyCreateArtifactError401And403Panic(t *testing.T) {
	setup(t)

	scheduleTask(t, testTask(t), GenericWorkerPayload{})
	tasks := ClaimWork(1)
	if len(tasks) != 1 {
		t.Fatalf("Expected to claim 1 task, got %v", len(tasks))
	}
	task := tasks[0]

	artifact := &artifacts.S3Artifact{
		BaseArtifact: &artifacts.BaseArtifact{
			Name: "public/build/firefox.exe",
		},
	}

	for _, code := range []int{401, 403} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("Expected classifyCreateArtifactError to panic for response code %v, but it didn't", code)
				}
			}()
			_ = task.classifyCreateArtifactError(artifact, []byte("{}"), &tcclient.APICallException{
				CallSummary: &tcclient.CallSummary{
					HTTPResponseBody: "credentials/scopes problem",
				},
				RootCause: httpbackoff.BadHttpResponseCode{
					HttpResponseCode: code,
				},
			})
		}()
	}
}

// TestEmptyArtifactNameDerivesFromPath verifies that an explicit empty
// string artifact name (as opposed to omitting the name field entirely) is
// accepted by the payload schema and derives the published artifact name
// from path, exactly as omitting the name field does. This is only
// reachable via a hand-authored task payload, since Go's `omitempty` tag
// means a Go-constructed Artifact{Name: ""} never serializes a "name" key
// at all, so it's built here via a map rather than the Artifact struct.
// See https://github.com/taskcluster/taskcluster/issues/9007
func TestEmptyArtifactNameDerivesFromPath(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    copyTestdataFile("SampleArtifacts/_/X.txt"),
		MaxRunTime: 30,
	}
	defaults.SetDefaults(&payload)

	payloadJSON, err := json.Marshal(&payload)
	if err != nil {
		t.Fatalf("Could not marshal payload: %v", err)
	}
	var payloadMap map[string]any
	if err := json.Unmarshal(payloadJSON, &payloadMap); err != nil {
		t.Fatalf("Could not unmarshal payload into map: %v", err)
	}
	payloadMap["artifacts"] = []map[string]any{
		{
			"path": "SampleArtifacts/_/X.txt",
			"type": "file",
			"name": "",
		},
	}
	finalPayloadJSON, err := json.Marshal(payloadMap)
	if err != nil {
		t.Fatalf("Could not marshal final payload: %v", err)
	}

	td := testTask(t)
	td.Payload = json.RawMessage(finalPayloadJSON)

	taskID := submitAndAssert(t, td, GenericWorkerPayload{}, "completed", "completed")

	expectedData, err := os.ReadFile(filepath.Join(testdataDir, "SampleArtifacts", "_", "X.txt"))
	if err != nil {
		t.Fatalf("Error reading source file: %v", err)
	}
	actualData := getArtifactContent(t, taskID, "SampleArtifacts/_/X.txt")
	if string(expectedData) != string(actualData) {
		t.Fatalf("Artifact content mismatch: expected %d bytes, got %d bytes", len(expectedData), len(actualData))
	}
}

// TestInvalidLiveLogNameFailsAsMalformedPayload verifies that logs.live is
// now subject to the same printable-ASCII pattern as artifact names, so a
// bad-charactered value is caught by schema validation as malformed-payload
// rather than reaching the Queue's CreateArtifact call at all.
// See https://github.com/taskcluster/taskcluster/issues/9007
func TestInvalidLiveLogNameFailsAsMalformedPayload(t *testing.T) {
	setup(t)

	td := testTask(t)
	td.Payload = json.RawMessage(`{
		"command": [` + rawHelloGoodbye() + `],
		"maxRunTime": 30,
		"logs": {
			"live": "public/logs/a\nb.log"
		}
	}`)

	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, `Does not match pattern '^[\x20-\x7e]+$'`) {
		t.Fatalf("Was expecting log to explain that logs.live violates the pattern, but it doesn't: \n%v", logtext)
	}
}

// TestInvalidBackingLogNameFailsAsMalformedPayload is the equivalent of
// TestInvalidLiveLogNameFailsAsMalformedPayload for logs.backing.
// See https://github.com/taskcluster/taskcluster/issues/9007
func TestInvalidBackingLogNameFailsAsMalformedPayload(t *testing.T) {
	setup(t)

	td := testTask(t)
	td.Payload = json.RawMessage(`{
		"command": [` + rawHelloGoodbye() + `],
		"maxRunTime": 30,
		"logs": {
			"backing": "public/logs/a\nb.log"
		}
	}`)

	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, `Does not match pattern '^[\x20-\x7e]+$'`) {
		t.Fatalf("Was expecting log to explain that logs.backing violates the pattern, but it doesn't: \n%v", logtext)
	}
}

func TestMissingOptionalDirectoryArtifactDoesNotFailTest(t *testing.T) {

	setup(t)

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:     "Nonexistent/dir",
				Expires:  expires,
				Type:     "directory",
				Optional: true,
			},
		},
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	expectedArtifacts := ExpectedArtifacts{
		"Nonexistent/dir": {
			StorageType:      "error",
			SkipContentCheck: true,
		},
		"public/logs/live_backing.log": {
			Extracts: []string{
				"hello world!",
				"goodbye world!",
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
	}
	expectedArtifacts.Validate(t, taskID, 0)
}

func TestInvalidContentEncoding(t *testing.T) {

	setup(t)

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()

	payload := GenericWorkerPayload{
		Command:    command,
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:            "SampleArtifacts/_/X.txt",
				Expires:         expires,
				Type:            "file",
				Name:            "public/_/X.txt",
				ContentType:     "text/plain; charset=utf-8",
				ContentEncoding: "jpg",
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	// check log mentions contentEncoding invalid
	logtext := LogText(t)
	if !strings.Contains(logtext, "[taskcluster:error] - artifacts.0.contentEncoding: artifacts.0.contentEncoding must be one of the following: \"identity\", \"gzip\"") {
		t.Fatalf("Was expecting log file to explain that contentEncoding was invalid, but it doesn't: \n%v", logtext)
	}
}

func TestInvalidContentEncodingBlacklisted(t *testing.T) {

	setup(t)

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()

	payload := GenericWorkerPayload{
		Command:    command,
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:            "SampleArtifacts/b/c/d.jpg",
				Expires:         expires,
				Type:            "file",
				Name:            "public/b/c/d.jpg",
				ContentType:     "image/jpeg",
				ContentEncoding: "jpg",
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	// check log mentions contentEncoding invalid
	logtext := LogText(t)
	if !strings.Contains(logtext, "[taskcluster:error] - artifacts.0.contentEncoding: artifacts.0.contentEncoding must be one of the following: \"identity\", \"gzip\"") {
		t.Fatalf("Was expecting log file to explain that contentEncoding was invalid, but it doesn't: \n%v", logtext)
	}
}

func TestEmptyContentEncoding(t *testing.T) {

	setup(t)

	td := testTask(t)
	td.Payload = json.RawMessage(`
{
  "command": [` + rawHelloGoodbye() + `],
  "maxRunTime": 30,
  "artifacts": [
    {
      "path": "SampleArtifacts/b/c/d.jpg",
      "expires": "` + tcclient.Time(time.Now().Add(time.Minute*30)).String() + `",
      "type": "file",
      "name": "public/b/c/d.jpg",
      "contentType": "image/jpeg",
      "contentEncoding": ""
    }
  ]
}`)

	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, "[taskcluster:error] - artifacts.0.contentEncoding: artifacts.0.contentEncoding must be one of the following: \"identity\", \"gzip\"") {
		t.Fatalf("Was expecting log file to explain that contentEncoding was invalid, but it doesn't: \n%v", logtext)
	}
}

func TestPublicDirectoryArtifact(t *testing.T) {
	setup(t)

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()
	command = append(command, copyTestdataFileTo("SampleArtifacts/_/X.txt", "public/build/X.txt")...)

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
	defaults.SetDefaults(&payload)
	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	expectedArtifacts := ExpectedArtifacts{
		"public/build/X.txt": {
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
			ContentLength:   14,
			Expires:         expires,
		},
		"public/logs/live_backing.log": {
			ContentType:      "text/plain; charset=utf-8",
			ContentEncoding:  "gzip",
			Expires:          td.Expires,
			SkipContentCheck: true,
		},
		"public/logs/live.log": {
			ContentType:      "text/plain; charset=utf-8",
			ContentEncoding:  "gzip",
			Expires:          td.Expires,
			SkipContentCheck: true,
		},
	}
	expectedArtifacts.Validate(t, taskID, 0)
}

func TestConflictingFileArtifactsInPayload(t *testing.T) {
	setup(t)

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
				Name:    "public/build/X.txt",
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "exception", "malformed-payload")

	queue := serviceFactory.Queue(nil, config.RootURL)
	artifacts, err := queue.ListArtifacts(taskID, "0", "", "")

	if err != nil {
		t.Fatalf("Error listing artifacts: %v", err)
	}

	if l := len(artifacts.Artifacts); l != 3 {
		t.Fatalf("Was expecting 3 artifacts, but got %v: %#v", l, artifacts)
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
	setup(t)

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()
	command = append(command, copyTestdataFile("SampleArtifacts/_/X.txt")...)

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
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}

func TestArtifactIncludedAsFileAndDirectoryInPayload(t *testing.T) {
	setup(t)

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()
	command = append(command, copyTestdataFile("SampleArtifacts/_/X.txt")...)

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
	defaults.SetDefaults(&payload)
	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	queue := serviceFactory.Queue(nil, config.RootURL)
	artifacts, err := queue.ListArtifacts(taskID, "0", "", "")

	if err != nil {
		t.Fatalf("Error listing artifacts: %v", err)
	}

	if l := len(artifacts.Artifacts); l != 3 {
		t.Fatalf("Was expecting 3 artifacts, but got %v: %#v", l, artifacts)
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

func TestFileArtifactHasNoExpiry(t *testing.T) {

	setup(t)

	payload := GenericWorkerPayload{
		Command:    copyTestdataFile("SampleArtifacts/_/X.txt"),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path: "SampleArtifacts/_/X.txt",
				Type: "file",
				Name: "public/build/firefox.exe",
			},
		},
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")
	// check artifact expiry matches task expiry
	queue := serviceFactory.Queue(nil, config.RootURL)
	lar, err := queue.ListArtifacts(taskID, "0", "", "")
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

	setup(t)

	payload := GenericWorkerPayload{
		Command:    copyTestdataFile("SampleArtifacts/_/X.txt"),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path: "SampleArtifacts/_",
				Type: "directory",
				Name: "public/build",
			},
		},
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")
	// check artifact expiry matches task expiry
	queue := serviceFactory.Queue(nil, config.RootURL)
	lar, err := queue.ListArtifacts(taskID, "0", "", "")
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

func TestObjectArtifact(t *testing.T) {

	t.Skip("Test currently skipped due to https://github.com/taskcluster/taskcluster/issues/6308")

	setup(t)
	config.CreateObjectArtifacts = true

	payload := GenericWorkerPayload{
		Command:    copyTestdataFile("object-test"),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path: "object-test",
				Type: "file",
				Name: "object-test.txt",
			},
		},
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)
	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

func TestFileArtifactWithAbsolutePath(t *testing.T) {

	setup(t)
	validateArtifacts(t,

		// what appears in task payload
		[]Artifact{
			{
				Expires: inAnHour,
				Path:    filepath.Join(testdataDir, "SampleArtifacts", "b", "c", "d.jpg"),
				Type:    "file",
				Name:    "public/build/firefox.exe",
			},
		},

		// what we expect to discover on file system
		[]artifacts.TaskArtifact{
			&artifacts.S3Artifact{
				BaseArtifact: &artifacts.BaseArtifact{
					Name:    "public/build/firefox.exe",
					Expires: inAnHour,
				},
				ContentType:     "image/jpeg",
				ContentEncoding: "identity",
				ContentLength:   17,
				Path:            filepath.Join(testdataDir, "SampleArtifacts", "b", "c", "d.jpg"),
			},
		})
}

// TestFileArtifactUploadFromAbsolutePath verifies that a task can create
// a file at an absolute path outside the task directory and publish it
// as an artifact.
func TestFileArtifactUploadFromAbsolutePath(t *testing.T) {
	setup(t)
	absDir := worldWritableTempDir(t, t.Name())
	absFile := filepath.Join(absDir, "artifact.txt")

	payload := GenericWorkerPayload{
		Command:    copyTestdataFileTo("SampleArtifacts/_/X.txt", absFile),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path: absFile,
				Type: "file",
				Name: "public/abs-path-artifact.txt",
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	// Verify the artifact content matches the original file
	expectedData, err := os.ReadFile(filepath.Join(testdataDir, "SampleArtifacts", "_", "X.txt"))
	if err != nil {
		t.Fatalf("Error reading source file: %v", err)
	}
	actualData := getArtifactContent(t, taskID, "public/abs-path-artifact.txt")
	if string(expectedData) != string(actualData) {
		t.Fatalf("Artifact content mismatch: expected %d bytes, got %d bytes", len(expectedData), len(actualData))
	}
}

func TestDirectoryArtifactUploadFromAbsolutePath(t *testing.T) {
	setup(t)
	absDir := worldWritableTempDir(t, t.Name())
	nestedFile := filepath.Join(absDir, "sub", "nested.jpg")

	payload := GenericWorkerPayload{
		Command:    copyTestdataFileTo("SampleArtifacts/b/c/d.jpg", nestedFile),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:    absDir,
				Expires: inAnHour,
				Type:    "directory",
				Name:    "public/abs-dir",
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	taskID := submitAndAssert(t, td, payload, "completed", "completed")

	expectedArtifacts := ExpectedArtifacts{
		"public/abs-dir/sub/nested.jpg": {
			ContentType:      "image/jpeg",
			ContentLength:    17,
			Expires:          inAnHour,
			StorageType:      "s3",
			SkipContentCheck: true,
		},
		"public/logs/live_backing.log": {
			ContentType:      "text/plain; charset=utf-8",
			ContentEncoding:  "gzip",
			Expires:          td.Expires,
			SkipContentCheck: true,
		},
		"public/logs/live.log": {
			ContentType:      "text/plain; charset=utf-8",
			ContentEncoding:  "gzip",
			Expires:          td.Expires,
			SkipContentCheck: true,
		},
	}
	expectedArtifacts.Validate(t, taskID, 0)
}
