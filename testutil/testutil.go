// Package testutil contains utilities that are used by tests from _multiple_ packages.
package testutil

import (
	"os"
	"testing"
)

func RequireTaskclusterCredentials(t *testing.T) {
	if os.Getenv("GW_SKIP_INTEGRATION_TESTS") != "" {
		t.Skip("Skipping since GW_SKIP_INTEGRATION_TESTS env var is set")
	}
	// check we have all the env vars we need to run this test
	if os.Getenv("TASKCLUSTER_CLIENT_ID") == "" ||
		os.Getenv("TASKCLUSTER_ACCESS_TOKEN") == "" ||
		os.Getenv("TASKCLUSTER_ROOT_URL") == "" {
		t.Fatal("TASKCLUSTER_{CLIENT_ID,ACCESS_TOKEN,ROOT_URL env vars not set, but GW_SKIP_INTEGRATION_TESTS not set")
	}
}
