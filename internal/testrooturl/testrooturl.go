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
	// tests only call public APIs, so no auth needed and we can use mozilla production deployment
	return rootURL
}
