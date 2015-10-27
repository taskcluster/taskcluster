package main

import (
	"code.google.com/p/go-uuid/uuid"
	"encoding/base64"
	"encoding/json"
	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-client-go/index"
	"github.com/taskcluster/taskcluster-client-go/queue"
	"os"
	"testing"
	"time"
)

// Generates a 22 character random slugId that is url-safe ([0-9a-zA-Z_\-]*)
func slug() string {
	return base64.URLEncoding.EncodeToString(uuid.NewRandom())[:22]
}

// This is a silly test that looks for the latest mozilla-central buildbot linux64 l10n build
// and asserts that it must have a created time between a year ago and an hour in the future.
//
// Could easily break at a point in the future, at which point we can change to something else.
//
// Note, no credentials are needed, so this can be run even on travis-ci.org, for example.
func TestFindLatestBuildbotTask(t *testing.T) {
	Index := index.New("", "")
	Queue := queue.New("", "")
	itr, cs1 := Index.FindTask("buildbot.branches.mozilla-central.linux64.l10n")
	if cs1.Error != nil {
		t.Fatalf("%v\n", cs1.Error)
	}
	taskId := itr.TaskId
	td, cs2 := Queue.Task(taskId)
	if cs2.Error != nil {
		t.Fatalf("%v\n", cs2.Error)
	}
	created := td.Created.Local()

	// calculate time an hour in the future to allow for clock drift
	now := time.Now().Local()
	inAnHour := now.Add(time.Hour * 1)
	aYearAgo := now.AddDate(-1, 0, 0)
	t.Log("")
	t.Log("  => Task " + taskId + " was created on " + created.Format("Mon, 2 Jan 2006 at 15:04:00 -0700"))
	t.Log("")
	if created.After(inAnHour) {
		t.Log("Current time: " + now.Format("Mon, 2 Jan 2006 at 15:04:00 -0700"))
		t.Error("Task " + taskId + " has a creation date that is over an hour in the future")
	}
	if created.Before(aYearAgo) {
		t.Log("Current time: " + now.Format("Mon, 2 Jan 2006 at 15:04:00 -0700"))
		t.Error("Task " + taskId + " has a creation date that is over a year old")
	}

}

// Tests whether it is possible to define a task against the production Queue.
func TestDefineTask(t *testing.T) {
	clientId := os.Getenv("TASKCLUSTER_CLIENT_ID")
	accessToken := os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	certificate := os.Getenv("TASKCLUSTER_CERTIFICATE")
	if clientId == "" || accessToken == "" {
		t.Skip("Skipping test TestDefineTask since TASKCLUSTER_CLIENT_ID and/or TASKCLUSTER_ACCESS_TOKEN env vars not set")
	}
	myQueue := queue.New(clientId, accessToken)
	myQueue.Certificate = certificate

	taskId := slugid.Nice()
	td := new(queue.TaskDefinition)
	td.Created = time.Now()
	td.Deadline = td.Created.AddDate(0, 0, 1)
	td.Expires = td.Deadline
	td.Extra = make(map[string]json.RawMessage)
	td.Extra["index"] = json.RawMessage(`{"rank":12345}`)
	td.Metadata.Description = "Stuff"
	td.Metadata.Name = "[TC] Pete"
	td.Metadata.Owner = "pmoore@mozilla.com"
	td.Metadata.Source = "http://everywhere.com/"
	td.Payload = make(map[string]json.RawMessage)
	td.Payload["features"] = json.RawMessage(`{"relengApiProxy":true}`)
	td.ProvisionerId = "win-provisioner"
	td.Retries = 5
	td.Routes = []string{
		"tc-treeherder.mozilla-inbound.bcf29c305519d6e120b2e4d3b8aa33baaf5f0163",
		"tc-treeherder-stage.mozilla-inbound.bcf29c305519d6e120b2e4d3b8aa33baaf5f0163",
	}
	td.SchedulerId = "go-test-test-scheduler"
	td.Scopes = []string{
		"docker-worker:image:taskcluster/builder:0.5.6",
		"queue:define-task:aws-provisioner-v1/build-c4-2xlarge",
	}
	td.Tags = make(map[string]json.RawMessage)
	td.Tags["createdForUser"] = json.RawMessage("cbook@mozilla.com")
	td.Priority = json.RawMessage(`"high"`)
	td.TaskGroupId = "dtwuF2n9S-i83G37V9eBuQ"
	td.WorkerType = "win2008-worker"

	tsr, cs := myQueue.DefineTask(taskId, td)
	if cs.Error != nil {
		t.Fatalf("Exception thrown: %s", cs.Error)
	}
	if provisionerId := cs.HttpRequestObject.(*queue.TaskDefinition).ProvisionerId; provisionerId != "win-provisioner" {
		t.Error("provisionerId 'win-provisioner' expected but got %s", provisionerId)
	}
	if schedulerId := tsr.Status.SchedulerId; schedulerId != "go-test-test-scheduler" {
		t.Error("schedulerId 'go-test-test-scheduler' expected but got %s", schedulerId)
	}
	if retriesLeft := tsr.Status.RetriesLeft; retriesLeft != 5 {
		t.Error("Expected 'retriesLeft' to be 5, but got %s", retriesLeft)
	}
	if state := tsr.Status.State; string(state) != `"unscheduled"` {
		t.Error("Expected 'state' to be 'unscheduled', but got %s", state)
	}
}
