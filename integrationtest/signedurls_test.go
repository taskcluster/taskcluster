package integrationtest

import (
	"io/ioutil"
	"testing"
	"time"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
)

// TestSignedURLPermCredsAuthScopes tests that a signed URL can be created from
// permanent credentials for downloading artifact `private/build/sources.xml`
// from task run
// https://tools.taskcluster.net/task-inspector/#X_WYg5S6QvKqMmmAgGo8ng/0 with
// authorized scopes restricted to just the permission required for downloading
// it, and successfully queried to return the protected content.
func TestSignedURLPermCredsAuthScopes(t *testing.T) {
	permaCreds := permaCreds(t)
	permaCreds.AuthorizedScopes = []string{"queue:get-artifact:private/build/sources.xml"}
	myQueue := tcqueue.New(permaCreds)
	createAndTestExampleSignedURL(myQueue, t)
}

// TestSignedURLPermCreds tests that a signed URL can be created from permanent
// credentials for downloading artifact `private/build/sources.xml` from task
// run https://tools.taskcluster.net/task-inspector/#X_WYg5S6QvKqMmmAgGo8ng/0
// and that the signed URL returns the protected content when queried.
func TestSignedURLPermCreds(t *testing.T) {
	permaCreds := permaCreds(t)
	myQueue := tcqueue.New(permaCreds)
	createAndTestExampleSignedURL(myQueue, t)
}

// TestBadAuthScopesSignedURL tests that if the authorized scopes supplied when
// generating a signed url exist, but do not include the required scopes for
// the given action, that the signed url will be generated, but when requested,
// it will not return the protected content, but rather an HTTP 401 error.
func TestBadAuthScopesSignedURL(t *testing.T) {
	permaCreds := permaCreds(t)
	permaCreds.AuthorizedScopes = []string{"queue:task-priority:high"}
	myQueue := tcqueue.New(permaCreds)
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
	permaCreds := permaCreds(t)
	tempCreds, err := permaCreds.CreateTemporaryCredentials(time.Minute*1, "queue:get-artifact:private/build/sources.xml")
	if err != nil {
		t.Fatal("Exception creating temporary credentials")
	}
	myQueue := tcqueue.New(tempCreds)
	createAndTestExampleSignedURL(myQueue, t)
}

// Utility function to validate that a signed URL can be created from the
// supplied queue credentials for artifact `private/build/sources.xml` from run
// https://tools.taskcluster.net/task-inspector/#X_WYg5S6QvKqMmmAgGo8ng/0, and
// that when queried, the signed URL returns content whose length matches the
// expected 12 bytes.
func createAndTestExampleSignedURL(myQueue *tcqueue.Queue, t *testing.T) {
	signedURL, err := myQueue.GetArtifact_SignedURL("X_WYg5S6QvKqMmmAgGo8ng", "0", "private/build/sources.xml", time.Second*30)
	if err != nil {
		t.Fatalf("Exception thrown signing URL\n%s", err)
	}
	resp, _, err := httpbackoff.Get(signedURL.String())
	if err != nil {
		t.Fatalf("Exception thrown connecting to signed URL %s\n%s", signedURL, err)
	}
	respBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Exception thrown reading from signed URL %s\n%s", signedURL, err)
	}
	if len(respBody) != 12 {
		t.Fatalf("Expected response body from signed URL %s to be 12 bytes, but was %v bytes", signedURL, len(respBody))
	}
}
