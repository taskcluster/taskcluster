// +build !docker

package main

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v31/clients/client-go"
	"github.com/taskcluster/taskcluster/v31/clients/client-go/tcqueue"
)

func checkSHA256(t *testing.T, sha256Hex string, file string) {
	hasher := sha256.New()
	f, err := os.Open(file)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := io.Copy(hasher, f); err != nil {
		t.Fatal(err)
	}
	if actualSHA256Hex := hex.EncodeToString(hasher.Sum(nil)); actualSHA256Hex != sha256Hex {
		t.Errorf("Expected file %v to have SHA256 %v but it was %v", file, sha256Hex, actualSHA256Hex)
	}
}

func CancelTask(t *testing.T) (td *tcqueue.TaskDefinitionRequest, payload GenericWorkerPayload) {
	// resolvetask is a go binary; source is in resolvetask subdirectory, binary is built in CI
	// but if running test manually, you may need to explicitly build it first.
	command := singleCommandNoArgs("resolvetask")
	payload = GenericWorkerPayload{
		Command:    command,
		MaxRunTime: 300,
	}
	fullCreds := config.Credentials()
	td = testTask(t)
	tempCreds, err := fullCreds.CreateNamedTemporaryCredentials("project/taskcluster:generic-worker-tester/"+t.Name(), time.Minute, "queue:cancel-task:"+td.SchedulerID+"/"+td.TaskGroupID+"/*")
	if err != nil {
		t.Fatalf("%v", err)
	}
	payload.Env = map[string]string{
		"TASKCLUSTER_CLIENT_ID":    tempCreds.ClientID,
		"TASKCLUSTER_ACCESS_TOKEN": tempCreds.AccessToken,
		"TASKCLUSTER_CERTIFICATE":  tempCreds.Certificate,
		"TASKCLUSTER_ROOT_URL":     config.RootURL,
	}
	for _, envVar := range []string{
		"PATH",
		"GOPATH",
		"GOROOT",
	} {
		if v, exists := os.LookupEnv(envVar); exists {
			payload.Env[envVar] = v
		}
	}
	return
}

type ArtifactTraits struct {
	Extracts        []string
	ContentType     string
	ContentEncoding string
	Expires         tcclient.Time
}

type ExpectedArtifacts map[string]ArtifactTraits

func (expectedArtifacts ExpectedArtifacts) Validate(t *testing.T, taskID string, run int) {

	queue := serviceFactory.Queue(nil, config.RootURL)
	artifacts, err := queue.ListArtifacts(taskID, strconv.Itoa(run), "", "")

	if err != nil {
		t.Fatalf("Error listing artifacts: %v", err)
	}

	actualArtifacts := make(map[string]struct {
		ContentType string        `json:"contentType"`
		Expires     tcclient.Time `json:"expires"`
		Name        string        `json:"name"`
		StorageType string        `json:"storageType"`
	}, len(artifacts.Artifacts))

	for _, actualArtifact := range artifacts.Artifacts {
		actualArtifacts[actualArtifact.Name] = actualArtifact
	}

	for artifact, expected := range expectedArtifacts {
		if actual, ok := actualArtifacts[artifact]; ok {
			if actual.ContentType != expected.ContentType {
				t.Errorf("Artifact %s should have mime type '%v' but has '%s'", artifact, expected.ContentType, actual.ContentType)
			}
			if !time.Time(expected.Expires).IsZero() {
				if actual.Expires.String() != expected.Expires.String() {
					t.Errorf("Artifact %s should have expiry '%s' but has '%s'", artifact, expected.Expires, actual.Expires)
				}
			}
		} else {
			t.Errorf("Artifact '%s' not created", artifact)
		}
		b, rawResp, resp, url := getArtifactContent(t, taskID, artifact)
		defer resp.Body.Close()
		for _, requiredSubstring := range expected.Extracts {
			if !strings.Contains(string(b), requiredSubstring) {
				t.Errorf("Artifact '%s': Could not find substring %q in '%s'", artifact, requiredSubstring, string(b))
			}
		}
		if actualContentEncoding := rawResp.Header.Get("Content-Encoding"); actualContentEncoding != expected.ContentEncoding {
			t.Fatalf("Expected Content-Encoding %q but got Content-Encoding %q for artifact %q from url %v", expected.ContentEncoding, actualContentEncoding, artifact, url)
		}
		if actualContentType := resp.Header.Get("Content-Type"); actualContentType != expected.ContentType {
			t.Fatalf("Content-Type in Signed URL %v response (%v) does not match Content-Type of artifact (%v)", url, actualContentType, expected.ContentType)
		}
	}
}
