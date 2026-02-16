package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/mcuadros/go-defaults"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/fileutil"
)

func TestPrivilegedFileUpload(t *testing.T) {
	setup(t)

	tempFile, err := os.CreateTemp(testdataDir, t.Name())
	if err != nil {
		t.Fatalf("Could not create temporary file: %v", err)
	}
	defer os.Remove(tempFile.Name())

	err = fileutil.SecureFiles(tempFile.Name())
	if err != nil {
		t.Fatalf("Could not secure temporary file: %v", err)
	}

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()

	payload := GenericWorkerPayload{
		Command:    command,
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:    filepath.Join("../../../", filepath.Base(tempFile.Name())),
				Expires: expires,
				Type:    "file",
				Name:    fmt.Sprintf("public/build/%s.txt", t.Name()),
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

func TestPrivilegedOptionalFileUploadDoesNotFailTest(t *testing.T) {
	setup(t)

	tempFile, err := os.CreateTemp(testdataDir, t.Name())
	if err != nil {
		t.Fatalf("Could not create temporary file: %v", err)
	}
	defer os.Remove(tempFile.Name())

	err = fileutil.SecureFiles(tempFile.Name())
	if err != nil {
		t.Fatalf("Could not secure temporary file: %v", err)
	}

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()

	payload := GenericWorkerPayload{
		Command:    command,
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:     filepath.Join("../../../", filepath.Base(tempFile.Name())),
				Expires:  expires,
				Type:     "file",
				Name:     fmt.Sprintf("public/build/%s.txt", t.Name()),
				Optional: true,
			},
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

func TestPrivilegedFileUploadAsCurrentUser(t *testing.T) {
	setup(t)

	tempFile, err := os.CreateTemp(testdataDir, t.Name())
	if err != nil {
		t.Fatalf("Could not create temporary file: %v", err)
	}
	defer os.Remove(tempFile.Name())

	err = fileutil.SecureFiles(tempFile.Name())
	if err != nil {
		t.Fatalf("Could not secure temporary file: %v", err)
	}

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	command := helloGoodbye()

	payload := GenericWorkerPayload{
		Command:    command,
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:    filepath.Join("../../../", filepath.Base(tempFile.Name())),
				Expires: expires,
				Type:    "file",
				Name:    fmt.Sprintf("public/build/%s.txt", t.Name()),
			},
		},
		Features: FeatureFlags{
			RunTaskAsCurrentUser: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes,
		"generic-worker:run-task-as-current-user:"+td.ProvisionerID+"/"+td.WorkerType,
	)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}
