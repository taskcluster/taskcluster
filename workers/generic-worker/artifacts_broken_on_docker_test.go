// +build !docker

package main

import (
	"testing"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

func TestPublicDirectoryArtifact(t *testing.T) {
	defer setup(t)()

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
	defer setup(t)()

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
	defer setup(t)()

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

func TestFileArtifactHasNoExpiry(t *testing.T) {

	defer setup(t)()

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

	defer setup(t)()

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
