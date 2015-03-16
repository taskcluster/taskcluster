package main

import (
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"github.com/taskcluster/taskcluster-client-go/queue"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

var (
	// Queue is the object we will use for accessing queue api. See
	// http://docs.taskcluster.net/queue/api-docs/
	Queue *queue.Auth
	// See SignedURLsManager() for more information:
	// signedURLsRequestChan is the channel you can pass a channel to, to get
	// back signed urls from the Task Cluster Queue, for querying Azure queues.
	signedURLsRequestChan chan chan *queue.PollTaskUrlsResponse = make(chan chan *queue.PollTaskUrlsResponse)
	// The *currently* one-and-only channel we request signedURLs to be written
	// to. In future we might require more channels to perform requests in
	// parallel, in which case they won't be global package vars.
	signedURLsResponseChan chan *queue.PollTaskUrlsResponse = make(chan *queue.PollTaskUrlsResponse)
)

// Entry point into the generic worker!
func main() {
	// Validate environment...
	for _, j := range []string{
		"PROVISIONER_ID",
		"REFRESH_URLS_PREMATURELY_SECS",
		"TASKCLUSTER_ACCESS_TOKEN",
		"TASKCLUSTER_CLIENT_ID",
		"WORKER_TYPE",
	} {
		if os.Getenv(j) == "" {
			log.Fatalf("Environment variable %v must be set.\n", j)
		}
	}

	// Queue is the object we will use for accessing queue api
	Queue = queue.New(os.Getenv("TASKCLUSTER_CLIENT_ID"), os.Getenv("TASKCLUSTER_ACCESS_TOKEN"))

	// Start the SignedURLsManager off in a dedicated go routing, to take care
	// of keeping signed urls up-to-date (i.e. refreshing as old urls expire).
	go SignedURLsManager()

	// loop forever claiming and running tasks!
	for {
		// make sure at least 1 second passes between iterations
		waitASec := time.NewTimer(time.Second * 1)
		taskFound := FindAndRunTask()
		if !taskFound {
			log.Printf("No task claimed from any Azure queue...")
		}
		// To avoid hammering queue, make sure there is at least a second
		// between consecutive requests. Note we do this even if a task ran,
		// since a task could complete in less than a second.
		<-waitASec.C
	}
}

// FindAndRunTask loops through the Azure queues in order, to find a task to
// run. If it finds one, it handles all the bookkeeping, as well as running the
// task. Returns true if it successfully claimed a task (regardless of whether
// the task ran successfully) otherwise false.
func FindAndRunTask() bool {
	// Write to the signed urls channel, to request signed urls back on
	// channel c.
	signedURLsRequestChan <- signedURLsResponseChan
	// Read the result.
	signedURLs := <-signedURLsResponseChan
	taskFound := false
	// Each of these signedURLs represent an underlying Azure queue, there
	// are multiple of these so that we can support priority. For this
	// reason the worker must poll the Azure queues in order they are
	// given.
	for _, urlPair := range signedURLs.Queues {
		// queueMessagesList stores the messages we get back from the azure
		// queue for this signed url
		task, err := SignedURLPair(urlPair).Poll()
		if err != nil {
			// This can be any error at all occurs in queryAzureQueue that
			// prevents us from claiming this task.  Log, and continue.
			log.Println(err)
			continue
		}
		// Once we find a task, run it, and then exit the loop. This
		// is because the loop is in order of priority, most important
		// first, so we will run the most important jobs (tasks) and
		// then return to polling the queue, ignorning remaining urls
		// for lower priority tasks that might still be left to loop
		// through, since by the time we complete the task, maybe
		// higher priority jobs are waiting.
		log.Println("Task found")
		// If there is one or more messages the worker must claim the tasks
		// referenced in the messages, and delete the messages.
		task.claim()
		task.run()
		break
	}
	return taskFound
}

// Queries the given Azure Queue signed url pair (poll url/delete url) and
// translates the Azure response into a Task object
func (urlPair SignedURLPair) Poll() (*TaskRun, error) {
	queueMessagesList := new(QueueMessagesList)
	// To poll an Azure Queue the worker must do a `GET` request to the
	// `signedPollUrl` from the object, representing the Azure queue. To
	// receive multiple messages at once the parameter `&numofmessages=N`
	// may be appended to `signedPollUrl`. The parameter `N` is the
	// maximum number of messages desired, `N` can be up to 32.
	// Since we can only process one task at a time, grab only one.
	resp, err := http.Get(urlPair.SignedPollUrl + "&numofmessages=1")
	if err != nil {
		log.Println(err)
		return nil, err
	}
	// When executing a `GET` request to `signedPollUrl` from an Azure queue object,
	// the request will return an XML document on the form:
	//
	// ```xml
	// <QueueMessagesList>
	//     <QueueMessage>
	//       <MessageId>...</MessageId>
	//       <InsertionTime>...</InsertionTime>
	//       <ExpirationTime>...</ExpirationTime>
	//       <PopReceipt>...</PopReceipt>
	//       <TimeNextVisible>...</TimeNextVisible>
	//       <DequeueCount>...</DequeueCount>
	//       <MessageText>...</MessageText>
	//     </QueueMessage>
	//     ...
	// </QueueMessagesList>
	// ```
	// We unmarshal the response into go objects, using the go xml decoder.
	fullBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	reader := strings.NewReader(string(fullBody))
	dec := xml.NewDecoder(reader)
	err = dec.Decode(&queueMessagesList)
	if err != nil {
		return nil, err
	}
	if len(queueMessagesList.QueueMessages) == 0 {
		return nil, errors.New("Zero tasks returned in Azure XML QueueMessagesList")
	}
	if size := len(queueMessagesList.QueueMessages); size > 1 {
		return nil, fmt.Errorf("%v tasks returned in Azure XML QueueMessagesList, even though &numofmessages=1 was specified in poll url", size)
	}

	// at this point we know there is precisely one QueueMessage (== task)
	qm := queueMessagesList.QueueMessages[0]

	// To find the task referenced in a message the worker must base64
	// decode and JSON parse the contents of the <MessageText> tag. This
	// would return an object on the form: {taskId, runId}.
	m, err := base64.StdEncoding.DecodeString(qm.MessageText)
	if err != nil {
		return nil, err
	}
	taskRun := TaskRun{QM: qm}
	err = json.Unmarshal(m, &taskRun)
	if err != nil {
		return nil, err
	}
	return &taskRun, nil
}

func (task *TaskRun) claim() error {
	fmt.Printf("  Message Id:            %v\n", task.QM.MessageId)
	fmt.Printf("  Insertion Time:        %v\n", task.QM.InsertionTime)
	fmt.Printf("  Expiration Time:       %v\n", task.QM.ExpirationTime)
	fmt.Printf("  Dequeue Count:         %v\n", task.QM.DequeueCount)
	fmt.Printf("  Pop Receipt:           %v\n", task.QM.PopReceipt)
	fmt.Printf("  Time Next Visible:     %v\n", task.QM.TimeNextVisible)
	fmt.Printf("  Message Text:          %v\n", task.QM.MessageText)
	fmt.Printf("  Task Id:               %v\n", task.TaskId)
	fmt.Printf("  Run Id:                %v\n", task.RunId)

	tcrq := queue.TaskClaimRequest{
		MessageId:   task.QM.MessageId,
		Receipt:     task.QM.PopReceipt,
		Token:       task.TaskId, // also in url route
		WorkerGroup: "Germany",
		WorkerId:    "MysteryWorkerX",
	}

	// Using the taskId and runId from the <MessageText> tag, the worker
	// must call queue.claimTask().
	tcrsp, resp := Queue.ClaimTask(task.TaskId, fmt.Sprintf("%d", task.RunId), &tcrq)

	// If the queue.claimTask() operation is successful or fails with a 4xx
	// error, the worker must delete the messages from the Azure queue.
	if (400 <= resp.StatusCode && resp.StatusCode < 500) || resp.StatusCode == 200 {
		log.Println("Since status code is 200 or in range [400, 500), deleting from azure queue...")
		task.deleteFromAzure()
	} else {
		return fmt.Errorf("Received HTTP response code %v when claiming task with taskId %v", resp.StatusCode, task.TaskId)
	}

	fmt.Println("-----------")
	fmt.Printf("  Status Code:           %v\n", resp.StatusCode)

	responseBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	fmt.Printf("  Response:              %v\n", string(responseBody))
	fmt.Printf("  Run Id:                %v\n", tcrsp.RunId)
	fmt.Printf("  Status Deadline:       %v\n", tcrsp.Status.Deadline)
	fmt.Printf("  Status Provisioner Id: %v\n", tcrsp.Status.ProvisionerId)
	fmt.Printf("  Status Retries Left:   %v\n", tcrsp.Status.RetriesLeft)
	fmt.Printf("  Status Scheduler Id:   %v\n", tcrsp.Status.SchedulerId)
	fmt.Printf("  Status State:          %v\n", tcrsp.Status.State)
	fmt.Printf("  Status Task Group Id:  %v\n", tcrsp.Status.TaskGroupId)
	fmt.Printf("  Status Task Id:        %v\n", tcrsp.Status.TaskId)
	fmt.Printf("  Status Worker Type:    %v\n", tcrsp.Status.WorkerType)
	fmt.Printf("  Status Runs:           %v\n", tcrsp.Status.Runs)
	fmt.Printf("  Taken Until:           %v\n", tcrsp.TakenUntil)
	fmt.Printf("  Worker Group:          %v\n", tcrsp.WorkerGroup)
	fmt.Printf("  Worker Id:             %v\n", tcrsp.WorkerId)
	fmt.Printf("==========================================\n")
	return nil
}

func (task *TaskRun) deleteFromAzure() {

	// Messages are deleted from the Azure queue with a DELETE request
	// to the signedDeleteUrl from the Azure queue object returned from
	// queue.pollTaskUrls. Before using the signedDeleteUrl the worker
	// must replace the placeholder {{messageId}} with the contents of
	// the <MessageId> tag. It is also necessary to replace the
	// placeholder {{popReceipt}} with the URI encoded contents of the
	// <PopReceipt> tag.
	// Notice, that the worker must URI encode the contents of <PopReceipt>
	// before substituting into the signedDeleteUrl. Otherwise, the worker will
	// experience intermittent failures. Also remark that the worker must
	// delete messages if the queue.claimTask operations fails with a 4xx
	// error. A 400 hundred range error implies that the task wasn't created,
	// not scheduled or already claimed, in either case the worker should
	// delete the message as we don't want another worker to receive message
	// later.
	// 'DELETE', task.deleteUri, this.maxRetries, this.requestRetryInterval

}

func (task *TaskRun) run() {
}

// Notice, that failure to delete messages from Azure queue is serious, as it
// wouldn't manifest itself in an immediate bug. Instead if messages repeatedly
// fails to be deleted, it would result in a lot of unnecessary calls to the
// queue and the Azure queue. The worker will likely continue to work, as the
// messages eventually disappears when their deadline is reached.
// However, the provisioner would over-provision aggressively as it would
// be unable to tell the number of pending tasks. And the worker would spend a lot
// of time attempting to claim faulty messages.
//
// For these reasons outlined above it's strongly advised that workers logs
// failures to delete messages from Azure queues. And that workers reads the
// value of the `<DequeueCount>` and logs messages that alerts the operator if
// a message has been dequeued a significant number of times. For example more
// than 10.
//
// Reclaiming Tasks
// ----------------
// When the worker has claimed a task, it's said to have a claim to a given
// `taskId`/`runId`. This claim has an expiration, see the `takenUntil` property
// in the _task status structure_ returned from `queue.claimTask` and
// `queue.reclaimTask`. A worker must call `queue.reclaimTask` before the claim
// denoted in `takenUntil` expires. It's recommended that this attempted a few
// minutes prior to expiration, to allow for clock drift.
//
//
// Dealing with Invalid Task Payloads
// ----------------------------------
// If the task payload is malformed or invalid, keep in mind that the queue doesn't
// validate the contents of the `task.payload` property, the worker may resolve the
// current run by reporting an exception. When reporting an exception, using
// `queue.reportException` the worker should give a `reason`. If the worker is
// unable execute the task specific payload/code/logic, it should report
// exception with the reason `malformed-payload`.
//
// This can also be used if an external resource that is referenced in a
// declarative nature doesn't exist. Generally, it should be used if we can be
// certain that another run of the task will have the same result. This differs
// from `queue.reportFailure` in the sense that we report a failure if the task
// specific code failed.
//
// Most tasks includes a lot of declarative steps, such as poll a docker image,
// create cache folder, decrypt encrypted environment variables, set environment
// variables and etc. Clearly, if decryption of environment variables fail, there
// is no reason to retry the task. Nor can it be said that the task failed,
// because the error wasn't cause by execution of Turing complete code.
//
// If however, we run some executable code referenced in `task.payload` and the
// code crashes or exists non-zero, then the task is said to be failed. The
// difference is whether or not the unexpected behavior happened before or after
// the execution of task specific Turing complete code.
//
//
// Terminating the Worker Early
// ----------------------------
// If the worker finds itself having to terminate early, for example a spot nodes
// that detects pending termination. Or a physical machine ordered to be
// provisioned for another purpose, the worker should report exception with the
// reason `worker-shutdown`. Upon such report the queue will resolve the run as
// exception and create a new run, if the task has additional retries left.
//
//
// Reporting Task Result
// ---------------------
// When the worker has completed the task successfully it should call
// `queue.reportCompleted`. If the task is unsuccessful, ie. exits non-zero, the
// worker should resolve it using `queue.reportFailed` (this implies test or
// build failure). If a task is malformed, the input is invalid, configuration
// is wrong, or the worker is told to shutdown by AWS before the the task is
// completed, it should be reported to the queue using `queue.reportException`.
