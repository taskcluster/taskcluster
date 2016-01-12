package integrationtest

import (
	"bytes"
	"encoding/json"
	"os"
	"regexp"
	"testing"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-base-go/jsontest"
	"github.com/taskcluster/taskcluster-client-go/index"
	"github.com/taskcluster/taskcluster-client-go/queue"
	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

// This is a silly test that looks for the latest mozilla-central buildbot linux64 l10n build
// and asserts that it must have a created time between a year ago and an hour in the future.
//
// Could easily break at a point in the future, at which point we can change to something else.
//
// Note, no credentials are needed, so this can be run even on travis-ci.org, for example.
func TestFindLatestBuildbotTask(t *testing.T) {
	creds := &tcclient.Credentials{}
	Index := index.New(creds)
	Queue := queue.New(creds)
	itr, _, err := Index.FindTask("buildbot.branches.mozilla-central.linux64.l10n")
	if err != nil {
		t.Fatalf("%v\n", err)
	}
	taskId := itr.TaskId
	td, _, err := Queue.Task(taskId)
	if err != nil {
		t.Fatalf("%v\n", err)
	}
	created := time.Time(td.Created).Local()

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

func permaCreds(t *testing.T) *tcclient.Credentials {
	permaCreds := &tcclient.Credentials{
		ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
		Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
	}
	if permaCreds.ClientId == "" || permaCreds.AccessToken == "" {
		t.Skip("Skipping test TestDefineTask since TASKCLUSTER_CLIENT_ID and/or TASKCLUSTER_ACCESS_TOKEN env vars not set")
	}
	return permaCreds
}

// Tests whether it is possible to define a task against the production Queue.
func TestDefineTask(t *testing.T) {
	permaCreds := permaCreds(t)
	myQueue := queue.New(permaCreds)

	taskId := slugid.Nice()
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
		ProvisionerId: "win-provisioner",
		Retries:       5,
		Routes: []string{
			"tc-treeherder.mozilla-inbound.bcf29c305519d6e120b2e4d3b8aa33baaf5f0163",
			"tc-treeherder-stage.mozilla-inbound.bcf29c305519d6e120b2e4d3b8aa33baaf5f0163",
		},
		SchedulerId: "go-test-test-scheduler",
		Scopes: []string{
			"test-worker:image:toastposter/pumpkin:0.5.6",
		},
		Tags:        json.RawMessage(`{"createdForUser":"cbook@mozilla.com"}`),
		Priority:    "high",
		TaskGroupId: "dtwuF2n9S-i83G37V9eBuQ",
		WorkerType:  "win2008-worker",
	}

	tsr, cs, err := myQueue.DefineTask(taskId, td)

	//////////////////////////////////
	// And now validate results.... //
	//////////////////////////////////

	if err != nil {
		b := bytes.Buffer{}
		cs.HttpRequest.Header.Write(&b)
		headers := regexp.MustCompile(`(mac|nonce)="[^"]*"`).ReplaceAllString(b.String(), `$1="***********"`)
		t.Logf("\n\nRequest sent:\n\nURL: %s\nMethod: %s\nHeaders:\n%v\nBody: %s", cs.HttpRequest.URL, cs.HttpRequest.Method, headers, cs.HttpRequestBody)
		t.Fatalf("\n\nResponse received:\n\n%s", err)
	}

	t.Logf("Task https://queue.taskcluster.net/v1/task/%v created successfully", taskId)

	if provisionerId := cs.HttpRequestObject.(*queue.TaskDefinitionRequest).ProvisionerId; provisionerId != "win-provisioner" {
		t.Errorf("provisionerId 'win-provisioner' expected but got %s", provisionerId)
	}
	if schedulerId := tsr.Status.SchedulerId; schedulerId != "go-test-test-scheduler" {
		t.Errorf("schedulerId 'go-test-test-scheduler' expected but got %s", schedulerId)
	}
	if retriesLeft := tsr.Status.RetriesLeft; retriesLeft != 5 {
		t.Errorf("Expected 'retriesLeft' to be 5, but got %v", retriesLeft)
	}
	if state := tsr.Status.State; state != "unscheduled" {
		t.Errorf("Expected 'state' to be 'unscheduled', but got %s", state)
	}
	submittedPayload := cs.HttpRequestBody

	// only the contents is relevant below - the formatting and order of properties does not matter
	// since a json comparison is done, not a string comparison...
	expectedJson := []byte(`
	{
	  "created":  "` + created.UTC().Format("2006-01-02T15:04:05.000Z") + `",
	  "deadline": "` + deadline.UTC().Format("2006-01-02T15:04:05.000Z") + `",
	  "expires":  "` + expires.UTC().Format("2006-01-02T15:04:05.000Z") + `",

	  "taskGroupId": "dtwuF2n9S-i83G37V9eBuQ",
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
	    "test-worker:image:toastposter/pumpkin:0.5.6"
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

	jsonCorrect, formattedExpected, formattedActual, err := jsontest.JsonEqual(expectedJson, []byte(submittedPayload))
	if err != nil {
		t.Fatalf("Exception thrown formatting json data!\n%s\n\nStruggled to format either:\n%s\n\nor:\n\n%s", err, string(expectedJson), submittedPayload)
	}

	if !jsonCorrect {
		t.Log("Anticipated json not generated. Expected:")
		t.Logf("%s", formattedExpected)
		t.Log("Actual:")
		t.Errorf("%s", formattedActual)
	}

	// check it is possible to cancel the unscheduled task using **temporary credentials**
	tempCreds, err := permaCreds.CreateTemporaryCredentials(30*time.Second, "queue:cancel-task:"+td.SchedulerId+"/"+td.TaskGroupId+"/"+taskId)
	if err != nil {
		t.Fatalf("Exception thrown generating temporary credentials!\n\n%s\n\n", err)
	}
	myQueue = queue.New(tempCreds)
	_, cs, err = myQueue.CancelTask(taskId)
	if err != nil {
		t.Logf("Exception thrown cancelling task with temporary credentials!\n\n%s\n\n", err)
		t.Fatalf("\n\n%s\n", cs.HttpRequest.Header)
	}
}
