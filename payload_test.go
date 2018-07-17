package main

import (
	"bytes"
	"encoding/json"
	"runtime"
	"testing"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
	"github.com/xeipuuv/gojsonschema"
)

func taskWithPayload(payload string) *TaskRun {
	return &TaskRun{
		TaskID: slugid.Nice(),
		Definition: tcqueue.TaskDefinitionResponse{
			Payload: json.RawMessage(payload),
		},
		logWriter: &bytes.Buffer{},
	}
}

func ensureValidPayload(t *testing.T, task *TaskRun) {
	err := task.validatePayload()
	if err != nil {
		t.Logf("%v", err.Cause)
		t.Fatalf("Valid task payload should have passed validation")
	}
}

func ensureMalformedPayload(t *testing.T, task *TaskRun) {
	err := task.validatePayload()
	if err == nil {
		t.Fatalf("Bad task payload should not have passed validation")
	}
	t.Logf("Task log:\n%v", task.logWriter)
	t.Logf("%v", err.Cause)
	if err.Reason != "malformed-payload" || err.TaskStatus != errored {
		t.Errorf("Bad task payload should have retured malformed-payload, but actually returned:\n%#v", err)
	}
}

// Test that the burned in payload schema is a valid json schema
func TestPayloadSchemaValid(t *testing.T) {
	payloadSchema := taskPayloadSchema()
	schemaLoader := gojsonschema.NewStringLoader(payloadSchema)
	_, err := gojsonschema.NewSchema(schemaLoader)
	if err != nil {
		t.Logf("Generic Worker payload schema is not a valid json schema for platform %v.", runtime.GOOS)
		t.Log("Payload schema:")
		t.Log(payloadSchema)
		t.Log("Error:")
		t.Fatalf("%s", err)
	}
}

// Badly formatted json payload should result in *json.SyntaxError error in task.validatePayload()
func TestTotallyMalformedPayload(t *testing.T) {
	ensureMalformedPayload(t, taskWithPayload(`bad payload, not even json`))
}

// Make sure only strings can be specified for env vars. In this test,
// GITHUB_PULL_REQUEST is specified as a number, rather than a string.
func TestEnvVarsMustBeStrings(t *testing.T) {
	ensureMalformedPayload(t, taskWithPayload(`{
  "env": {
    "XPI_NAME": "dist/example_add-on-0.0.1.zip",
    "GITHUB_PULL_REQUEST": 37,
    "GITHUB_BASE_BRANCH": "master"
  },
  "maxRunTime": 1200,
  `+rawHelloGoodbye()+`
}`))
}

// Extra fields not allowed
func TestExtraFieldsNotAllowed(t *testing.T) {
	ensureMalformedPayload(t, taskWithPayload(`{
  "env": {
    "XPI_NAME": "dist/example_add-on-0.0.1.zip"
  },
  "maxRunTime": 3,
  "extraField": "This field is not allowed!",
  `+rawHelloGoodbye()+`
}`))
}

// At least one command must be specified
func TestNoCommandsSpecified(t *testing.T) {
	ensureMalformedPayload(t, taskWithPayload(`{
  "env": {
    "XPI_NAME": "dist/example_add-on-0.0.1.zip"
  },
  "maxRunTime": 3,
  "command": []
}`))
}

// Valid payload should pass validation
func TestValidPayload(t *testing.T) {
	ensureValidPayload(t, taskWithPayload(`{
  "env": {
    "XPI_NAME": "dist/example_add-on-0.0.1.zip"
  },
  "maxRunTime": 3,
  `+rawHelloGoodbye()+`
}`))
}

// This little hack is to make sure we get a timestamp which is truncated to
// the millisecond
func NowMillis(t *testing.T) (now time.Time) {
	var err error
	now, err = time.Parse(time.RFC3339, tcclient.Time(time.Now()).String())
	if err != nil {
		t.Fatalf("Error parsing timestamp - %v", err)
	}
	return
}

// If an artifact expires before task deadline we should get a Malformed Payload
func TestArtifactExpiresBeforeDeadline(t *testing.T) {
	now := NowMillis(t)
	task := taskWithPayload(`{
  "env": {
    "XPI_NAME": "dist/example_add-on-0.0.1.zip"
  },
  "maxRunTime": 3,
  ` + rawHelloGoodbye() + `,
  "artifacts": [
    {
      "type": "file",
      "path": "public/some/artifact",
      "expires": "` + tcclient.Time(now.Add(time.Minute*5)).String() + `"
    }
  ]
}`)
	task.Definition.Deadline = tcclient.Time(now.Add(time.Minute * 10))
	task.Definition.Expires = tcclient.Time(now.Add(time.Minute * 20))
	ensureMalformedPayload(t, task)
}

// If artifact expires with task deadline, we should not get a Malformed Payload
func TestArtifactExpiresWithDeadline(t *testing.T) {
	now := NowMillis(t)
	task := taskWithPayload(`{
  "env": {
    "XPI_NAME": "dist/example_add-on-0.0.1.zip"
  },
  "maxRunTime": 3,
  ` + rawHelloGoodbye() + `,
  "artifacts": [
    {
      "type": "file",
      "path": "public/some/artifact",
      "expires": "` + tcclient.Time(now.Add(time.Minute*10)).String() + `"
    }
  ]
}`)
	task.Definition.Deadline = tcclient.Time(now.Add(time.Minute * 10))
	task.Definition.Expires = tcclient.Time(now.Add(time.Minute * 20))
	ensureValidPayload(t, task)
}

// If artifact expires after task deadline, but before task expiry, we should not get a Malformed Payload
func TestArtifactExpiresBetweenDeadlineAndTaskExpiry(t *testing.T) {
	now := NowMillis(t)
	task := taskWithPayload(`{
  "env": {
    "XPI_NAME": "dist/example_add-on-0.0.1.zip"
  },
  "maxRunTime": 3,
  ` + rawHelloGoodbye() + `,
  "artifacts": [
    {
      "type": "file",
      "path": "public/some/artifact",
      "expires": "` + tcclient.Time(now.Add(time.Minute*15)).String() + `"
    }
  ]
}`)
	task.Definition.Deadline = tcclient.Time(now.Add(time.Minute * 10))
	task.Definition.Expires = tcclient.Time(now.Add(time.Minute * 20))
	ensureValidPayload(t, task)
}

// If artifact expires with task expiry, we should not get a Malformed Payload
func TestArtifactExpiresWithTask(t *testing.T) {
	now := NowMillis(t)
	task := taskWithPayload(`{
  "env": {
    "XPI_NAME": "dist/example_add-on-0.0.1.zip"
  },
  "maxRunTime": 3,
  ` + rawHelloGoodbye() + `,
  "artifacts": [
    {
      "type": "file",
      "path": "public/some/artifact",
      "expires": "` + tcclient.Time(now.Add(time.Minute*20)).String() + `"
    }
  ]
}`)
	task.Definition.Deadline = tcclient.Time(now.Add(time.Minute * 10))
	task.Definition.Expires = tcclient.Time(now.Add(time.Minute * 20))
	ensureValidPayload(t, task)
}

// If an artifact expires after task expiry we should get a Malformed Payload
func TestArtifactExpiresAfterTaskExpiry(t *testing.T) {
	now := NowMillis(t)
	task := taskWithPayload(`{
  "env": {
    "XPI_NAME": "dist/example_add-on-0.0.1.zip"
  },
  "maxRunTime": 3,
  ` + rawHelloGoodbye() + `,
  "artifacts": [
    {
      "type": "file",
      "path": "public/some/artifact",
      "expires": "` + tcclient.Time(now.Add(time.Minute*25)).String() + `"
    }
  ]
}`)
	task.Definition.Deadline = tcclient.Time(now.Add(time.Minute * 10))
	task.Definition.Expires = tcclient.Time(now.Add(time.Minute * 20))
	ensureMalformedPayload(t, task)
}

func TestInvalidPayload(t *testing.T) {
	defer setup(t)()

	td := testTask(t)
	td.Payload = json.RawMessage(`
{
  ` + rawHelloGoodbye() + `,
  "maxRunTime": 60,
  "mounts": [
    {
      "content": {
        "sha356": "0bb12875044674d632d1f1b2f53cf33510a6df914178fe672f3f70f6f6cdf80d",
        "url": "https://storage.googleapis.com/golang/go1.10.2.windows-386.zip"
      },
      "directory": "go1.10.2",
      "format": "zip"
    }
  ]
}`)

	_ = submitAndAssert(t, td, GenericWorkerPayload{}, "exception", "malformed-payload")
}
