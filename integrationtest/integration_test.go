package integrationtest

import (
	"encoding/json"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-base-go/jsontest"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/index"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

// This is a silly test that looks for the latest mozilla-inbound linux64 debug
// build and asserts that it must have a created time between a year ago and an
// hour in the future.
//
// Could easily break at a point in the future, e.g. if this index route
// changes, at which point we can change to something else.
//
// Note, no credentials are needed, so this can be run even on travis-ci.org,
// for example.
func TestFindLatestLinux64DebugBuild(t *testing.T) {
	creds := &tcclient.Credentials{}
	Index := index.New(creds)
	Queue := queue.New(creds)
	itr, err := Index.FindTask("gecko.v1.mozilla-inbound.latest.linux.linux64.debug")
	if err != nil {
		t.Fatalf("%v\n", err)
	}
	taskID := itr.TaskID
	td, err := Queue.Task(taskID)
	if err != nil {
		t.Fatalf("%v\n", err)
	}
	created := time.Time(td.Created).Local()

	// calculate time an hour in the future to allow for clock drift
	now := time.Now().Local()
	inAnHour := now.Add(time.Hour * 1)
	aYearAgo := now.AddDate(-1, 0, 0)
	t.Log("")
	t.Log("  => Task " + taskID + " was created on " + created.Format("Mon, 2 Jan 2006 at 15:04:00 -0700"))
	t.Log("")
	if created.After(inAnHour) {
		t.Log("Current time: " + now.Format("Mon, 2 Jan 2006 at 15:04:00 -0700"))
		t.Error("Task " + taskID + " has a creation date that is over an hour in the future")
	}
	if created.Before(aYearAgo) {
		t.Log("Current time: " + now.Format("Mon, 2 Jan 2006 at 15:04:00 -0700"))
		t.Error("Task " + taskID + " has a creation date that is over a year old")
	}

}

func permaCreds(t *testing.T) *tcclient.Credentials {
	permaCreds := &tcclient.Credentials{
		ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
		Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
	}
	if permaCreds.ClientID == "" || permaCreds.AccessToken == "" {
		t.Skip("Skipping test TestDefineTask since TASKCLUSTER_CLIENT_ID and/or TASKCLUSTER_ACCESS_TOKEN env vars not set")
	}
	return permaCreds
}

// Tests whether it is possible to define a task against the production Queue.
func TestDefineTask(t *testing.T) {
	permaCreds := permaCreds(t)
	myQueue := queue.New(permaCreds)

	taskID := slugid.Nice()
	taskGroupID := slugid.Nice()
	created := time.Now()
	deadline := created.AddDate(0, 0, 1)
	expires := deadline

	td := &queue.TaskDefinitionRequest{
		Created:  tcclient.Time(created),
		Deadline: tcclient.Time(deadline),
		Expires:  tcclient.Time(expires),
		Extra:    json.RawMessage(`{"index":{"rank":12345}}`),
		Metadata: struct {
			Description string `json:"description"`
			Name        string `json:"name"`
			Owner       string `json:"owner"`
			Source      string `json:"source"`
		}{
			Description: "Stuff",
			Name:        "[TC] Pete",
			Owner:       "pmoore@mozilla.com",
			Source:      "http://everywhere.com/",
		},
		Payload:       json.RawMessage(`{"features":{"relengApiProxy":true}}`),
		ProvisionerID: "win-provisioner",
		Retries:       5,
		Routes: []string{
			"tc-treeherder.mozilla-inbound.bcf29c305519d6e120b2e4d3b8aa33baaf5f0163",
			"tc-treeherder-stage.mozilla-inbound.bcf29c305519d6e120b2e4d3b8aa33baaf5f0163",
		},
		SchedulerID: "go-test-test-scheduler",
		Scopes: []string{
			"queue:task-priority:high",
		},
		Tags:        json.RawMessage(`{"createdForUser":"cbook@mozilla.com"}`),
		Priority:    "high",
		TaskGroupID: taskGroupID,
		WorkerType:  "win2008-worker",
	}

	cd := tcclient.ConnectionData(*myQueue)
	resp, cs, err := (&cd).APICall(td, "POST", "/task/"+url.QueryEscape(taskID)+"/define", new(queue.TaskStatusResponse), nil)
	tsr := resp.(*queue.TaskStatusResponse)

	//////////////////////////////////
	// And now validate results.... //
	//////////////////////////////////

	if err != nil {
		t.Fatalf("%s", err)
	}

	t.Logf("Task https://queue.taskcluster.net/v1/task/%v created successfully", taskID)

	if provisionerID := cs.HTTPRequestObject.(*queue.TaskDefinitionRequest).ProvisionerID; provisionerID != "win-provisioner" {
		t.Errorf("provisionerId 'win-provisioner' expected but got %s", provisionerID)
	}
	if schedulerID := tsr.Status.SchedulerID; schedulerID != "go-test-test-scheduler" {
		t.Errorf("schedulerId 'go-test-test-scheduler' expected but got %s", schedulerID)
	}
	if retriesLeft := tsr.Status.RetriesLeft; retriesLeft != 5 {
		t.Errorf("Expected 'retriesLeft' to be 5, but got %v", retriesLeft)
	}
	if state := tsr.Status.State; state != "unscheduled" {
		t.Errorf("Expected 'state' to be 'unscheduled', but got %s", state)
	}
	submittedPayload := cs.HTTPRequestBody

	// only the contents is relevant below - the formatting and order of properties does not matter
	// since a json comparison is done, not a string comparison...
	expectedJSON := []byte(`
	{
	  "created":  "` + created.UTC().Format("2006-01-02T15:04:05.000Z") + `",
	  "deadline": "` + deadline.UTC().Format("2006-01-02T15:04:05.000Z") + `",
	  "expires":  "` + expires.UTC().Format("2006-01-02T15:04:05.000Z") + `",

	  "taskGroupId": "` + taskGroupID + `",
	  "workerType":  "win2008-worker",
	  "schedulerId": "go-test-test-scheduler",

	  "payload": {
	    "features": {
	      "relengApiProxy":true
	    }
	  },

	  "priority":      "high",
	  "provisionerId": "win-provisioner",
	  "retries":       5,

	  "routes": [
	    "tc-treeherder.mozilla-inbound.bcf29c305519d6e120b2e4d3b8aa33baaf5f0163",
	    "tc-treeherder-stage.mozilla-inbound.bcf29c305519d6e120b2e4d3b8aa33baaf5f0163"
	  ],

	  "scopes": [
	  	"queue:task-priority:high"
	  ],

	  "tags": {
	    "createdForUser": "cbook@mozilla.com"
	  },

	  "extra": {
	    "index": {
	      "rank": 12345
	    }
	  },

	  "metadata": {
	    "description": "Stuff",
	    "name":        "[TC] Pete",
	    "owner":       "pmoore@mozilla.com",
	    "source":      "http://everywhere.com/"
	  }
	}
	`)

	jsonCorrect, formattedExpected, formattedActual, err := jsontest.JsonEqual(expectedJSON, []byte(submittedPayload))
	if err != nil {
		t.Fatalf("Exception thrown formatting json data!\n%s\n\nStruggled to format either:\n%s\n\nor:\n\n%s", err, string(expectedJSON), submittedPayload)
	}

	if !jsonCorrect {
		t.Log("Anticipated json not generated. Expected:")
		t.Logf("%s", formattedExpected)
		t.Log("Actual:")
		t.Errorf("%s", formattedActual)
	}

	// check it is possible to cancel the unscheduled task using **temporary credentials**
	tempCreds, err := permaCreds.CreateTemporaryCredentials(30*time.Second, "queue:cancel-task:"+td.SchedulerID+"/"+td.TaskGroupID+"/"+taskID)
	if err != nil {
		t.Fatalf("Exception thrown generating temporary credentials!\n\n%s\n\n", err)
	}
	myQueue = queue.New(tempCreds)
	_, err = myQueue.CancelTask(taskID)
	if err != nil {
		t.Fatalf("Exception thrown cancelling task with temporary credentials!\n\n%s\n\n", err)
	}
}
