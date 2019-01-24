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
	"github.com/taskcluster/taskcluster-client-go/readwriteseeker"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
	artifact "github.com/taskcluster/taskcluster-lib-artifact-go"
)

// TestSignedURLPermCredsAuthScopes tests that a signed URL can be created from
// permanent credentials for downloading artifact `private/build/sources.xml`
// from task run
// https://tools.taskcluster.net/task-inspector/#X_WYg5S6QvKqMmmAgGo8ng/0 with
// authorized scopes restricted to just the permission required for downloading
// it, and successfully queried to return the protected content.
func TestSignedURLPermCredsAuthScopes(t *testing.T) {
	rootURL := tcclient.RootURLFromEnvVars()
	if rootURL == "" {
		t.Skip("Cannot run test, neither TASKCLUSTER_PROXY_URL nor TASKCLUSTER_ROOT_URL are set to non-empty strings")
	}
	permaCreds := permaCreds(t)
	permaCreds.AuthorizedScopes = []string{
		"queue:get-artifact:private/build/sources.xml",
		"queue:scheduler-id:-",
		"queue:create-task:lowest:test-provisioner/*",
		"queue:claim-work:test-provisioner/*",
		"queue:worker-id:test-worker-group/test-worker-id",
	}
	myQueue := tcqueue.New(permaCreds, rootURL)
	createAndTestExampleSignedURL(myQueue, t)
}

// TestSignedURLPermCreds tests that a signed URL can be created from permanent
// credentials for downloading artifact `private/build/sources.xml` from task
// run https://tools.taskcluster.net/task-inspector/#X_WYg5S6QvKqMmmAgGo8ng/0
// and that the signed URL returns the protected content when queried.
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
// it will not return the protected content, but rather an HTTP 401 error.
func TestBadAuthScopesSignedURL(t *testing.T) {
	rootURL := tcclient.RootURLFromEnvVars()
	if rootURL == "" {
		t.Skip("Cannot run test, neither TASKCLUSTER_PROXY_URL nor TASKCLUSTER_ROOT_URL are set to non-empty strings")
	}
	permaCreds := permaCreds(t)
	permaCreds.AuthorizedScopes = []string{"queue:task-priority:high"}
	myQueue := tcqueue.New(permaCreds, rootURL)
	signedURL, err := myQueue.GetArtifact_SignedURL("X_WYg5S6QvKqMmmAgGo8ng", "0", "private/build/sources.xml", time.Second*30)
	if err != nil {
		t.Fatalf("Exception thrown signing URL\n%s", err)
	}
	_, _, err = httpbackoff.Get(signedURL.String())
	if err == nil {
		t.Fatalf("Was expecting an error to be throw due to http 401, but didn't get an error")
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

// TestSignedURLTempCreds tests that a signed URL can be created from temporary
// credentials for downloading artifact `private/build/sources.xml` from task
// run https://tools.taskcluster.net/task-inspector/#X_WYg5S6QvKqMmmAgGo8ng/0
// with temporary credentials' scopes restricted to just the permission
// required for downloading it, and that the signed URL returns the protected
// content when queried.
func TestSignedURLTempCreds(t *testing.T) {
	rootURL := tcclient.RootURLFromEnvVars()
	if rootURL == "" {
		t.Skip("Cannot run test, neither TASKCLUSTER_PROXY_URL nor TASKCLUSTER_ROOT_URL are set to non-empty strings")
	}
	permaCreds := permaCreds(t)
	tempCreds, err := permaCreds.CreateTemporaryCredentials(time.Minute*1,
		"queue:get-artifact:private/build/sources.xml",
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

// Utility function to validate that a signed URL can be created from the
// supplied queue credentials for artifact `private/build/sources.xml` from run
// https://tools.taskcluster.net/task-inspector/#X_WYg5S6QvKqMmmAgGo8ng/0, and
// that when queried, the signed URL returns content whose length matches the
// expected 12 bytes.
func createAndTestExampleSignedURL(myQueue *tcqueue.Queue, t *testing.T) {
	now := time.Now()
	workerType := slugid.Nice()
	provisionerID := "test-provisioner"
	artifactName := "private/build/sources.xml"
	artifactContent := []byte("!@##%@$%@#$<sd fsdhf")
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
		ProvisionerID: provisionerID,
		WorkerType:    workerType,
	}
	cwrq := tcqueue.ClaimWorkRequest{
		Tasks:       1,
		WorkerGroup: "test-worker-group",
		WorkerID:    "test-worker-id",
	}
	taskID := slugid.Nice()
	t.Logf("Creating task %v", taskID)
	_, err := myQueue.CreateTask(taskID, &tdr)
	if err != nil {
		t.Fatalf("Exception thrown creating task %v:\n%s", taskID, err)
	}
	t.Logf("Claiming work for provisionerId/workerType %v/%v", provisionerID, workerType)
	cwrs, err := myQueue.ClaimWork(provisionerID, workerType, &cwrq)
	if err != nil {
		t.Fatalf("Exception thrown claiming task %v:\n%s", taskID, err)
	}
	taskCreds := cwrs.Tasks[0].Credentials
	taskQueue := tcqueue.New(&tcclient.Credentials{
		ClientID:         taskCreds.ClientID,
		AccessToken:      taskCreds.AccessToken,
		Certificate:      taskCreds.Certificate,
		AuthorizedScopes: nil,
	}, "")
	taskQueue.BaseURL = myQueue.BaseURL
	in := bytes.NewReader(artifactContent)
	var out readwriteseeker.ReadWriteSeeker

	t.Logf("Uploading artifact %v to task %v", artifactName, taskID)
	a := artifact.New(taskQueue)
	err = a.Upload(taskID, "0", artifactName, in, &out, false, false)
	if err != nil {
		t.Fatalf("Exception thrown uploading artifact %v in task %v:\n%s", artifactName, taskID, err)
	}

	t.Logf("Resolving task %v", taskID)
	_, err = taskQueue.ReportCompleted(taskID, "0")
	if err != nil {
		t.Fatalf("Exception reporting task %v completed: %v", taskID, err)
	}

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
