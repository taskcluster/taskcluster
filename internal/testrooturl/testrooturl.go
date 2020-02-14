package testrooturl

import (
	"os"
	"testing"
)

// Get gets the rootURL, or skips the test if a root URL is not available,
// *unless* NO_TEST_SKIP is set, in which case this is considered a fatal
// error.
func Get(t *testing.T) string {
	rootURL := os.Getenv("TASKCLUSTER_ROOT_URL")
	if rootURL == "" {
		if os.Getenv("NO_TEST_SKIP") == "" {
			t.Skip("Set TASKCLUSTER_ROOT_URL to run tests")
		} else {
			t.Fatal("TASKCLUSTER_ROOT_URL must be set when NO_TEST_SKIP is set")
		}
	}
	return rootURL
}

// Like Get, but also return clientID, accessToken, and optional certificate.
func GetWithCreds(t *testing.T) (rootURL string, clientID string, accessToken string, certificate string) {
	rootURL = os.Getenv("TASKCLUSTER_ROOT_URL")
	clientID = os.Getenv("TASKCLUSTER_CLIENT_ID")
	accessToken = os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	certificate = os.Getenv("TASKCLUSTER_CERTIFICATE")
	if rootURL == "" || clientID == "" || accessToken == "" {
		if os.Getenv("NO_TEST_SKIP") == "" {
			t.Skip("Set TASKCLUSTER_ROOT_URL, TASKCLUSTER_CLIENT_ID, and TASKCLUSTER_ACCESS_TOKEN to run tests")
		} else {
			t.Fatal("TASKCLUSTER_ROOT_URL, TASKCLUSTER_CLIENT_ID, and TASKCLUSTER_ACCESS_TOKEN must be set when NO_TEST_SKIP is set")
		}
	}
	return
}
