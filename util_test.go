package main

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"testing"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
	"github.com/taskcluster/taskcluster-client-go/tcutil"
)

func createPrivateArtifact(t *testing.T, taskScopes []string) (taskID, artifactName string, artifactContent []byte) {
	skipIfNoPermCreds(t)
	queue := tcqueue.New(permCredentials, rootURL)
	now := time.Now()
	taskID = slugid.Nice()
	artifactName = "taskcluster-proxy-test/512-random-bytes"
	artifactContent = make([]byte, 512)
	_, err := rand.Read(artifactContent)
	if err != nil {
		t.Fatalf("Error generating random bytes for artifact content: %v", err)
	}
	tdr := tcqueue.TaskDefinitionRequest{
		Created:  tcclient.Time(now),
		Deadline: tcclient.Time(now.Add(1 * time.Hour)),
		Expires:  tcclient.Time(now.Add(60 * 24 * time.Hour)),
		Metadata: tcqueue.TaskMetadata{
			Description: "Task created by integration test " + t.Name(),
			Name:        t.Name(),
			Owner:       "pmoore@mozilla.com",
			Source:      "https://github.com/taskcluster/taskcluster-proxy/blob/master/authorization_test.go",
		},
		Payload:       json.RawMessage(`{}`),
		ProvisionerID: "test-provisioner",
		WorkerType:    slugid.Nice(),
		Scopes:        taskScopes,
	}
	in := bytes.NewReader(artifactContent)
	artifacts := []tcutil.ArtifactSource{
		{
			Name:      artifactName,
			Content:   in,
			GZip:      false,
			Multipart: false,
		},
	}
	err = tcutil.PublishTask(queue, taskID, tdr, "test-worker-group", "test-worker-id", artifacts)
	if err != nil {
		t.Fatalf("%v", err)
	}
	return
}
