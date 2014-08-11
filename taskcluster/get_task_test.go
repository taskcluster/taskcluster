package taskcluster_test

import (
	tc "github.com/lightsofapollo/taskcluster-proxy/taskcluster"
	"testing"
)

// XXX: This is a terrible test since it will eventually fail but the docker
// worker tests will ensure this will work...
func TestGetTask(t *testing.T) {
	task, err := tc.GetTask("0H68C0ivQI2PWjWMs4D3Cw")

	if err != nil {
		t.Errorf("Error fetching task: %s", err)
	}

	if task.ProvisonerId != "no-provisioning-nope" {
		t.Errorf("Could not fetch task...")
	}
}

func TestGetTaskError(t *testing.T) {
	_, err := tc.GetTask("magicfoobar")

	if !(err != nil) {
		t.Errorf("Error expected in task fetching")
	}
}
