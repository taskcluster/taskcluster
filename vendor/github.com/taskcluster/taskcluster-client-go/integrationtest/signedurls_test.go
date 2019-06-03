package integrationtest

import (
	"bytes"
	"encoding/json"
	"io/ioutil"
	"testing"
	"time"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
	"github.com/taskcluster/taskcluster-client-go/tcutil"
)

// TestSignedURLPermCredsAuthScopes tests that permanent credentials are able
// to perform a call to createAndTestExampleSignedURL, when the authorized
// scopes of the permanent credentials are restricted to the bare minimum
// required by the function.
func TestSignedURLPermCredsAuthScopes(t *testing.T) {
	rootURL := tcclient.RootURLFromEnvVars()
	if rootURL == "" {
		t.Skip("Cannot run test, neither TASKCLUSTER_PROXY_URL nor TASKCLUSTER_ROOT_URL are set to non-empty strings")
	}
	permaCreds := permaCreds(t)
	permaCreds.AuthorizedScopes = []string{
		"queue:get-artifact:private/TestSignedURLPermCredsAuthScopes.bin",
		"queue:scheduler-id:-",
		"queue:create-task:lowest:test-provisioner/*",
		"queue:claim-work:test-provisioner/*",
		"queue:worker-id:test-worker-group/test-worker-id",
	}
	myQueue := tcqueue.New(permaCreds, rootURL)
	createAndTestExampleSignedURL(myQueue, t)
}

// TestSignedURLPermCreds tests that temporary credentials, derived from
// permanent credentials, are able to perform a call to
// createAndTestExampleSignedURL, when no authorized scopes are specified for
// the temporary credentials, but the permanent client has the required scopes.
func TestSignedURLPermCreds(t *testing.T) {
	rootURL := tcclient.RootURLFromEnvVars()
	if rootURL == "" {
		t.Skip("Cannot run test, neither TASKCLUSTER_PROXY_URL nor TASKCLUSTER_ROOT_URL are set to non-empty strings")
	}
	permaCreds := permaCreds(t)
	myQueue := tcqueue.New(permaCreds, rootURL)
	createAndTestExampleSignedURL(myQueue, t)
}

// TestBadAuthScopesSignedURL tests that if the authorized scopes supplied when
// generating a signed url exist, but do not include the required scopes for
// the given action, that the signed url will be generated, but when requested,
// it will not return the protected content, but rather an HTTP 403 error.
func TestBadAuthScopesSignedURL(t *testing.T) {
	rootURL := tcclient.RootURLFromEnvVars()
	if rootURL == "" {
		t.Skip("Cannot run test, neither TASKCLUSTER_PROXY_URL nor TASKCLUSTER_ROOT_URL are set to non-empty strings")
	}
	permaCreds := permaCreds(t)
	permaCreds.AuthorizedScopes = []string{
		"queue:scheduler-id:-",
		"queue:create-task:lowest:test-provisioner/*",
		"queue:claim-work:test-provisioner/*",
		"queue:worker-id:test-worker-group/test-worker-id",
	}
	myQueue := tcqueue.New(permaCreds, rootURL)
	taskID, artifactName, _ := createSampleTaskAndArtifact(myQueue, t)
	signedURL, err := myQueue.GetArtifact_SignedURL(taskID, "0", artifactName, time.Second*30)
	if err != nil {
		t.Fatalf("Exception thrown signing URL\n%s", err)
	}
	_, _, err = httpbackoff.Get(signedURL.String())
	if err == nil {
		t.Fatalf("Was expecting an error to be throw due to http 403, but didn't get an error")
	}
	switch e := err.(type) {
	case httpbackoff.BadHttpResponseCode:
		if statusCode := e.HttpResponseCode; statusCode != 403 {
			t.Fatalf("Was expecting http status code to be 403, but was %v", statusCode)
		}
	default:
		t.Fatalf("Was expecting an error to be httpbackoff.BadHttpResponseCode, but instead was %T", err)
	}
}

// TestSignedURLTempCreds tests that temporary credentials, derived from
// permanent credentials, are able to perform a call to
// createAndTestExampleSignedURL, when the authorized scopes of the temporary
// credentials are restricted to the bare minimum required by the function.
func TestSignedURLTempCreds(t *testing.T) {
	rootURL := tcclient.RootURLFromEnvVars()
	if rootURL == "" {
		t.Skip("Cannot run test, neither TASKCLUSTER_PROXY_URL nor TASKCLUSTER_ROOT_URL are set to non-empty strings")
	}
	permaCreds := permaCreds(t)
	tempCreds, err := permaCreds.CreateTemporaryCredentials(time.Minute*1,
		"queue:get-artifact:private/TestSignedURLTempCreds.bin",
		"queue:scheduler-id:-",
		"queue:create-task:lowest:test-provisioner/*",
		"queue:claim-work:test-provisioner/*",
		"queue:worker-id:test-worker-group/test-worker-id",
	)
	if err != nil {
		t.Fatal("Exception creating temporary credentials")
	}
	myQueue := tcqueue.New(tempCreds, rootURL)
	createAndTestExampleSignedURL(myQueue, t)
}

// createAndTestExampleSignedURL validates that a private artifact can be
// uploaded and signed with the provided queue client, and that an HTTP request
// to the signed URL returns a byte-for-byte copy of the artifact.
func createAndTestExampleSignedURL(myQueue *tcqueue.Queue, t *testing.T) {
	taskID, artifactName, artifactContent := createSampleTaskAndArtifact(myQueue, t)
	signedURL, err := myQueue.GetArtifact_SignedURL(taskID, "0", artifactName, time.Second*30)
	if err != nil {
		t.Fatalf("Exception thrown signing URL\n%s", err)
	}

	t.Logf("Fetching artifact from signed URL %v", signedURL)
	resp, _, err := httpbackoff.Get(signedURL.String())
	if err != nil {
		t.Fatalf("Exception thrown connecting to signed URL %s\n%s", signedURL, err)
	}
	respBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Exception thrown reading from signed URL %s\n%s", signedURL, err)
	}
	if string(respBody) != string(artifactContent) {
		t.Fatalf("Expected response body to be %q, but was %q", string(respBody), artifactContent)
	}
}

func createSampleTaskAndArtifact(myQueue *tcqueue.Queue, t *testing.T) (taskID string, artifactName string, artifactContent []byte) {
	now := time.Now()
	taskID = slugid.Nice()
	artifactName = "private/" + t.Name() + ".bin"
	artifactContent = []byte("!@##%@$%@#$<sd fsdhf")
	tdr := tcqueue.TaskDefinitionRequest{
		Created:  tcclient.Time(now),
		Deadline: tcclient.Time(now.Add(1 * time.Hour)),
		Expires:  tcclient.Time(now.Add(60 * 24 * time.Hour)),
		Metadata: tcqueue.TaskMetadata{
			Description: "Task created by integration test " + t.Name(),
			Name:        t.Name(),
			Owner:       "pmoore@mozilla.com",
			Source:      "https://github.com/taskcluster/taskcluster-client-go/blob/master/integrationtest/signedurls_test.go",
		},
		Payload:       json.RawMessage(`{}`),
		ProvisionerID: "test-provisioner",
		WorkerType:    slugid.Nice(),
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
	err := tcutil.PublishTask(myQueue, taskID, tdr, "test-worker-group", "test-worker-id", artifacts)
	if err != nil {
		t.Fatalf("%v", err)
	}
	return
}
