package main

import (
	"code.google.com/p/go-uuid/uuid"
	"encoding/base64"
	"github.com/taskcluster/taskcluster-client-go/index"
	"github.com/taskcluster/taskcluster-client-go/queue"
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
// Note, no credentials are needed, so this can be run even on travis-ci.org, for example
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

//    //
//    // Tests whether it is possible to define a task against the production
//    // Queue.
//     //
//    func TestDefineTask(t *testing.T) {
//        String clientId = System.getenv("TASKCLUSTER_CLIENT_ID")
//        String accessToken = System.getenv("TASKCLUSTER_ACCESS_TOKEN")
//        String certificate = System.getenv("TASKCLUSTER_CERTIFICATE")
//        Assume.assumeFalse(clientId == null || clientId == "" || accessToken == null || accessToken == "")
//        Queue queue
//        if (certificate == null || certificate == "") {
//            queue = new Queue(clientId, accessToken)
//        } else {
//            queue = new Queue(clientId, accessToken, certificate)
//        }
//        String taskId = slug()
//        TaskDefinition td = new TaskDefinition()
//        td.created = new Date()
//        Calendar c = Calendar.getInstance()
//        c.setTime(td.created)
//        c.add(Calendar.DATE, 1)
//        td.deadline = c.getTime()
//        td.expires = td.deadline
//        Map<String, Object> index = new HashMap<String, Object>()
//        index.put("rank", 12345)
//        Map<String, Object> extra = new HashMap<String, Object>()
//        extra.put("index", index)
//        td.extra = extra
//        td.metadata = td.new Metadata()
//        td.metadata.description = "Stuff"
//        td.metadata.name = "[TC] Pete"
//        td.metadata.owner = "pmoore@mozilla.com"
//        td.metadata.source = "http://somewhere.com/"
//        Map<String, Object> features = new HashMap<String, Object>()
//        features.put("relengAPIProxy", true)
//        Map<String, Object> payload = new HashMap<String, Object>()
//        payload.put("features", features)
//        td.payload = payload
//        td.provisionerId = "win-provisioner"
//        td.retries = 5
//        td.routes = new String[] { "tc-treeherder.mozilla-inbound.bcf29c305519d6e120b2e4d3b8aa33baaf5f0163",
//                "tc-treeherder-stage.mozilla-inbound.bcf29c305519d6e120b2e4d3b8aa33baaf5f0163" }
//        td.schedulerId = "junit-test-scheduler"
//        td.scopes = new String[] { "docker-worker:image:taskcluster/builder:0.5.6",
//                "queue:define-task:aws-provisioner-v1/build-c4-2xlarge" }
//
//        Map<String, Object> tags = new HashMap<String, Object>()
//        tags.put("createdForUser", "cbook@mozilla.com")
//        td.tags = tags
//        td.taskGroupId = "dtwuF2n9S-i83G37V9eBuQ"
//        td.workerType = "win2008-worker"
//
//        try {
//            CallSummary<TaskDefinition, TaskStatusResponse> cs = queue.defineTask(taskId, td)
//            Assert.assertEquals(cs.requestPayload.provisionerId, "win-provisioner")
//            Assert.assertEquals(cs.responsePayload.status.schedulerId, "junit-test-scheduler")
//            Assert.assertEquals(cs.responsePayload.status.retriesLeft, 5)
//            Assert.assertEquals(cs.responsePayload.status.state, "unscheduled")
//        } catch (APICallFailure e) {
//            e.printStackTrace()
//            Assert.fail("Exception thrown")
//        }
//    }
