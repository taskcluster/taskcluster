//go:build multiuser

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/mcuadros/go-defaults"
	tcclient "github.com/taskcluster/taskcluster/v80/clients/client-go"
	"github.com/taskcluster/taskcluster/v80/workers/generic-worker/fileutil"
)

func TestPrivilegedFileUpload(t *testing.T) {
	// This test shouldn't use an external taskcluster instance,
	// as it depends on an updated queue service.
	// Otherwise, the test will run into a schema validation
	// failure due to fact that the post-artifact-request.yml
	// schema on Community-TC doesn't have "file-not-readable-on-worker"
	// reason as a valid option during the development of PR #6673.
	useExternalTC := os.Getenv("GW_TESTS_USE_EXTERNAL_TASKCLUSTER")
	err := os.Unsetenv("GW_TESTS_USE_EXTERNAL_TASKCLUSTER")
	if err != nil {
		t.Fatalf("Could not unset the GW_TESTS_USE_EXTERNAL_TASKCLUSTER environment variable: %v", err)
	}
	defer func() {
		err := os.Setenv("GW_TESTS_USE_EXTERNAL_TASKCLUSTER", useExternalTC)
		if err != nil {
			t.Fatalf("Could not set the GW_TESTS_USE_EXTERNAL_TASKCLUSTER environment variable back to original value: %v", err)
		}
	}()

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

func TestPrivilegedFileUploadAsCurrentUser(t *testing.T) {
	// This test shouldn't use an external taskcluster instance,
	// as it depends on an updated queue service.
	// Otherwise, the test will run into a schema validation
	// failure due to fact that the post-artifact-request.yml
	// schema on Community-TC doesn't have "file-not-readable-on-worker"
	// reason as a valid option during the development of PR #6673.
	useExternalTC := os.Getenv("GW_TESTS_USE_EXTERNAL_TASKCLUSTER")
	err := os.Unsetenv("GW_TESTS_USE_EXTERNAL_TASKCLUSTER")
	if err != nil {
		t.Fatalf("Could not unset the GW_TESTS_USE_EXTERNAL_TASKCLUSTER environment variable: %v", err)
	}
	defer func() {
		err := os.Setenv("GW_TESTS_USE_EXTERNAL_TASKCLUSTER", useExternalTC)
		if err != nil {
			t.Fatalf("Could not set the GW_TESTS_USE_EXTERNAL_TASKCLUSTER environment variable back to original value: %v", err)
		}
	}()

	setup(t)
	config.EnableRunTaskAsCurrentUser = true

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
