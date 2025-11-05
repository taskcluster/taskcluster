package main

import (
	"encoding/json"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/mcuadros/go-defaults"
	tcclient "github.com/taskcluster/taskcluster/v92/clients/client-go"
	"github.com/xeipuuv/gojsonschema"
)

// Test that the burned in payload schema is a valid json schema
func TestPayloadSchemaValid(t *testing.T) {
	payloadSchema := JSONSchema()
	schemaLoader := gojsonschema.NewStringLoader(payloadSchema)
	_, err := gojsonschema.NewSchema(schemaLoader)
	if err != nil {
		t.Logf("Generic Worker payload schema is not a valid json schema for platform/engine %v/%v.", runtime.GOOS, engine)
		t.Log("Payload schema:")
		t.Log(payloadSchema)
		t.Log("Error:")
		t.Fatalf("%s", err)
	}
}

func TestEmptyPayloadObject(t *testing.T) {
	setup(t)
	td := testTask(t)
	td.Payload = json.RawMessage(
		`{}`,
	)
	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "exception", "malformed-payload")
}

// Make sure only strings can be specified for env vars. In this test,
// GITHUB_PULL_REQUEST is specified as a number, rather than a string.
func TestEnvVarsMustBeStrings(t *testing.T) {
	setup(t)
	td := testTask(t)
	td.Payload = json.RawMessage(`
		{
		  "env": {
		    "XPI_NAME": "dist/example_add-on-0.0.1.zip",
		    "GITHUB_PULL_REQUEST": 37,
		    "GITHUB_BASE_BRANCH": "main"
		  },
		  "maxRunTime": 1200,
		  "command": [` + rawHelloGoodbye() + `]
		}`,
	)
	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "exception", "malformed-payload")
}

func TestMalformedPayloadIncludesSchema(t *testing.T) {
	setup(t)
	td := testTask(t)
	// invalid payload, that is still valid json
	td.Payload = json.RawMessage(`{"a": "b"}`)
	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "exception", "malformed-payload")
	logtext := LogText(t)
	// all worker schemas include a definition for "writableDirectoryCache" so let's use that
	if !strings.Contains(logtext, `"writableDirectoryCache":`) {
		t.Fatalf("Log does't include expected text: %v", logtext)
	}
}

// Extra fields not allowed
func TestExtraFieldsNotAllowed(t *testing.T) {
	setup(t)
	td := testTask(t)
	td.Payload = json.RawMessage(`{
	  "env": {
	    "XPI_NAME": "dist/example_add-on-0.0.1.zip"
	  },
	  "maxRunTime": 3,
	  "extraField": "This field is not allowed!",
	  "command": [` + rawHelloGoodbye() + `]
	}`)
	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "exception", "malformed-payload")
	logtext := LogText(t)
	if !strings.Contains(logtext, `Task payload for this worker type must conform to the following jsonschema:`) {
		t.Fatalf("Log does't include expected text: %v", logtext)
	}
}

// At least one command must be specified
func TestNoCommandsSpecified(t *testing.T) {
	setup(t)
	td := testTask(t)
	td.Payload = json.RawMessage(`{
	  "env": {
	    "XPI_NAME": "dist/example_add-on-0.0.1.zip"
	  },
	  "maxRunTime": 3,
	  "command": []
	}`)
	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "exception", "malformed-payload")
	logtext := LogText(t)
	if !strings.Contains(logtext, `Task payload for this worker type must conform to the following jsonschema:`) {
		t.Fatalf("Log does't include expected text: %v", logtext)
	}
}

// Valid payload should pass validation
func TestValidPayload(t *testing.T) {
	setup(t)
	td := testTask(t)
	td.Payload = json.RawMessage(`{
	  "env": {
	    "XPI_NAME": "dist/example_add-on-0.0.1.zip"
	  },
	  "maxRunTime": 3,
	  "command": [` + rawHelloGoodbye() + `]
	}`)
	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "completed", "completed")
}

// If an artifact expires before task deadline we should get a Malformed Payload
func TestArtifactExpiresBeforeDeadline(t *testing.T) {
	setup(t)
	now := time.Now()
	td := testTask(t)
	command := helloGoodbye()
	command = append(command, copyTestdataFile("SampleArtifacts/_/X.txt")...)

	payload := GenericWorkerPayload{
		Env: map[string]string{
			"XPI_NAME": "dist/example_add-on-0.0.1.zip",
		},
		MaxRunTime: 3,
		Command:    command,
		Artifacts: []Artifact{
			{
				Type:    "file",
				Path:    "SampleArtifacts/_/X.txt",
				Expires: tcclient.Time(now.Add(time.Minute * 5)),
			},
		},
	}
	defaults.SetDefaults(&payload)

	td.Deadline = tcclient.Time(now.Add(time.Minute * 10))
	td.Expires = tcclient.Time(now.Add(time.Minute * 20))
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	logtext := LogText(t)
	if !strings.Contains(logtext, "expires before task deadline") {
		t.Fatalf("Log does't include expected text: %v", logtext)
	}
}

// If a task has a higher `maxRunTime` than the `maxTaskRunTime` set in the worker config we should get a Malformed Payload
func TestMaxTaskRunTime(t *testing.T) {
	setup(t)
	td := testTask(t)
	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 310,
	}
	defaults.SetDefaults(&payload)
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	logtext := LogText(t)
	if !strings.Contains(logtext, "task's maxRunTime of 310 exceeded allowed maximum of 300") {
		t.Fatalf("Log does't include expected text: %v", logtext)
	}
}

// If artifact expires with task deadline, we should not get a Malformed Payload
func TestArtifactExpiresWithDeadline(t *testing.T) {
	setup(t)
	now := time.Now()
	td := testTask(t)
	command := helloGoodbye()
	command = append(command, copyTestdataFile("SampleArtifacts/_/X.txt")...)

	payload := GenericWorkerPayload{
		Env: map[string]string{
			"XPI_NAME": "dist/example_add-on-0.0.1.zip",
		},
		MaxRunTime: 3,
		Command:    command,
		Artifacts: []Artifact{
			{
				Type:    "file",
				Path:    "SampleArtifacts/_/X.txt",
				Expires: tcclient.Time(now.Add(time.Minute * 10)),
			},
		},
	}
	defaults.SetDefaults(&payload)

	td.Deadline = tcclient.Time(now.Add(time.Minute * 10))
	td.Expires = tcclient.Time(now.Add(time.Minute * 20))
	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

// If artifact expires after task deadline, but before task expiry, we should not get a Malformed Payload
func TestArtifactExpiresBetweenDeadlineAndTaskExpiry(t *testing.T) {
	setup(t)
	now := time.Now()
	td := testTask(t)
	command := helloGoodbye()
	command = append(command, copyTestdataFile("SampleArtifacts/_/X.txt")...)

	payload := GenericWorkerPayload{
		Env: map[string]string{
			"XPI_NAME": "dist/example_add-on-0.0.1.zip",
		},
		MaxRunTime: 3,
		Command:    command,
		Artifacts: []Artifact{
			{
				Type:    "file",
				Path:    "SampleArtifacts/_/X.txt",
				Expires: tcclient.Time(now.Add(time.Minute * 15)),
			},
		},
	}
	defaults.SetDefaults(&payload)

	td.Deadline = tcclient.Time(now.Add(time.Minute * 10))
	td.Expires = tcclient.Time(now.Add(time.Minute * 20))
	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

// If artifact expires with task expiry, we should not get a Malformed Payload
func TestArtifactExpiresWithTask(t *testing.T) {
	setup(t)
	now := time.Now()
	td := testTask(t)
	command := helloGoodbye()
	command = append(command, copyTestdataFile("SampleArtifacts/_/X.txt")...)

	payload := GenericWorkerPayload{
		Env: map[string]string{
			"XPI_NAME": "dist/example_add-on-0.0.1.zip",
		},
		MaxRunTime: 3,
		Command:    command,
		Artifacts: []Artifact{
			{
				Type:    "file",
				Path:    "SampleArtifacts/_/X.txt",
				Expires: tcclient.Time(now.Add(time.Minute * 20)),
			},
		},
	}
	defaults.SetDefaults(&payload)

	td.Deadline = tcclient.Time(now.Add(time.Minute * 10))
	td.Expires = tcclient.Time(now.Add(time.Minute * 20))
	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

// If an artifact expires after task expiry we should get a Malformed Payload
func TestArtifactExpiresAfterTaskExpiry(t *testing.T) {
	setup(t)
	now := time.Now()
	td := testTask(t)
	command := helloGoodbye()
	command = append(command, copyTestdataFile("SampleArtifacts/_/X.txt")...)

	payload := GenericWorkerPayload{
		Env: map[string]string{
			"XPI_NAME": "dist/example_add-on-0.0.1.zip",
		},
		MaxRunTime: 3,
		Command:    command,
		Artifacts: []Artifact{
			{
				Type:    "file",
				Path:    "SampleArtifacts/_/X.txt",
				Expires: tcclient.Time(now.Add(time.Minute * 25)),
			},
		},
	}
	defaults.SetDefaults(&payload)

	td.Deadline = tcclient.Time(now.Add(time.Minute * 10))
	td.Expires = tcclient.Time(now.Add(time.Minute * 20))
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	logtext := LogText(t)
	if !strings.Contains(logtext, "expires after task expiry") {
		t.Fatalf("Log does't include expected text: %v", logtext)
	}
}

func TestInvalidPayload(t *testing.T) {
	setup(t)

	td := testTask(t)
	td.Payload = json.RawMessage(`
{
  "command": [` + rawHelloGoodbye() + `],
  "maxRunTime": 60,
  "mounts": [
    {
      "content": {
        "sha356": "9ded97d830bef3734ea6de70df0159656d6a63e01484175b34d72b8db326bda0",
        "url": "https://go.dev/dl/go1.10.8.windows-386.zip"
      },
      "directory": "go1.10.8",
      "format": "zip"
    }
  ]
}`)

	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "exception", "malformed-payload")
}
