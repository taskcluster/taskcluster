package main

import (
	"io/ioutil"
	"testing"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

// TestSignedURL tests that a signed URL can be created, and works
func TestSignedURL(t *testing.T) {
	permaCreds := permaCreds(t)
	myQueue := queue.New(permaCreds)
	signedUrl, err := myQueue.GetArtifact_SignedURL("DD1kmgFiRMWTjyiNoEJIMA", "0", "private/build/sources.xml")
	if err != nil {
		t.Fatalf("Exception thrown signing URL\n%s", err)
	}
	resp, _, err := httpbackoff.Get(signedUrl.String())
	if err != nil {
		t.Fatalf("Exception thrown connecting to signed URL %s\n%s", signedUrl, err)
	}
	respBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Exception thrown reading from signed URL %s\n%s", signedUrl, err)
	}
	if len(respBody) != 18170 {
		t.Fatalf("Expected response body from signed URL %s to be 18170 bytes, but was %s bytes", signedUrl, len(respBody))
	}
}
