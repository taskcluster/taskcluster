package taskcluster_test

import (
	"testing"

	tc "github.com/taskcluster/taskcluster-proxy/taskcluster"
)

// XXX: This is a terrible test since it will eventually fail but the docker
// worker tests will ensure this will work...
func TestGetTask(t *testing.T) {
	task, err := tc.GetTask("6dS50KOBRjCZX2L-ql3atQ")

	if err != nil {
		t.Fatalf("Error fetching task: %s", err)
	}

	if task.Scopes[0] != "docker-worker:cache:tc-vcs" {
		t.Errorf("Could not fetch task...")
	}
}

func TestGetTaskError(t *testing.T) {
	_, err := tc.GetTask("magicfoobar")

	if !(err != nil) {
		t.Errorf("Error expected in task fetching")
	}
}
