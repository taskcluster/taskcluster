package taskcluster_test

import (
	"testing"

	tc "github.com/lightsofapollo/taskcluster-proxy/taskcluster"
)

// XXX: This is a terrible test since it will eventually fail but the docker
// worker tests will ensure this will work...
func TestGetTask(t *testing.T) {
	task, err := tc.GetTask("2szAy1JzSr6pyjVCdiTcoQ")

	if err != nil {
		t.Fatalf("Error fetching task: %s", err)
	}

	if task.ProvisonerId != "aws-provisioner" {
		t.Errorf("Could not fetch task...")
	}
}

func TestGetTaskError(t *testing.T) {
	_, err := tc.GetTask("magicfoobar")

	if !(err != nil) {
		t.Errorf("Error expected in task fetching")
	}
}
