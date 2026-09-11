//go:build multiuser

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/mcuadros/go-defaults"
	tcclient "github.com/taskcluster/taskcluster/v108/clients/client-go"
	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/fileutil"
)

func TestPrivilegedFileUpload(t *testing.T) {
	if os.Getenv("GW_IN_DOCKER") == "1" {
		t.Skip("Skipping in Docker: file permission isolation requires a non-root environment")
	}
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

func TestPrivilegedOptionalFileUploadFailsTask(t *testing.T) {
	if os.Getenv("GW_IN_DOCKER") == "1" {
		t.Skip("Skipping in Docker: file permission isolation requires a non-root environment")
	}
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

	_ = submitAndAssert(t, td, payload, "failed", "failed")
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

func TestPrivilegedFileInOptionalDirectoryArtifactFailsTask(t *testing.T) {
	if os.Getenv("GW_IN_DOCKER") == "1" {
		t.Skip("Skipping in Docker: file permission isolation requires a non-root environment")
	}
	setup(t)

	tempDir, err := os.MkdirTemp(testdataDir, t.Name())
	if err != nil {
		t.Fatalf("Could not create temporary directory: %v", err)
	}
	defer os.RemoveAll(tempDir)

	makeDirWorldWritable(t, tempDir)
	readableFile := filepath.Join(tempDir, "readable.txt")
	if err := os.WriteFile(readableFile, []byte("banana"), 0644); err != nil {
		t.Fatalf("Could not create readable file: %v", err)
	}

	unreadableFile := filepath.Join(tempDir, "unreadable.txt")
	if err := os.WriteFile(unreadableFile, []byte("baguette"), 0644); err != nil {
		t.Fatalf("Could not create unreadable file: %v", err)
	}
	if err := fileutil.SecureFiles(unreadableFile); err != nil {
		t.Fatalf("Could not secure temporary file: %v", err)
	}

	expires := tcclient.Time(time.Now().Add(time.Minute * 30))

	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		Artifacts: []Artifact{
			{
				Path:     filepath.Join("../../../", filepath.Base(tempDir)),
				Expires:  expires,
				Type:     "directory",
				Name:     fmt.Sprintf("public/build/%s", t.Name()),
				Optional: true,
			},
		},
	}
	defaults.SetDefaults(&payload)

	td := testTask(t)
	taskID := submitAndAssert(t, td, payload, "failed", "failed")

	readableArtifact := fmt.Sprintf("public/build/%s/readable.txt", t.Name())
	if content := string(getArtifactContent(t, taskID, readableArtifact)); content != "banana" {
		t.Fatalf("Artifact %v has content %q, expected \"banana\". Something must've gone horribly wrong", readableArtifact, content)
	}
}
