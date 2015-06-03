package main

import (
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go/queue"
	"github.com/xeipuuv/gojsonschema"
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
	// parallel, in which case we won't have a single global package var.
	signedURLsResponseChan chan *queue.PollTaskUrlsResponse = make(chan *queue.PollTaskUrlsResponse)
)

// Entry point into the generic worker...
func main() {
	// Any custom startup per platform...
	startup()
	// Validate environment...
	for _, j := range []string{
		"PAYLOAD_SCHEMA",
		"PROVISIONER_ID",
		"REFRESH_URLS_PREMATURELY_SECS",
		"TASKCLUSTER_ACCESS_TOKEN",
		"TASKCLUSTER_CLIENT_ID",
		"WORKER_GROUP",
		"WORKER_ID",
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
		// try to grab a task using the url pair (url pair = poll url + delete
		// url)
		task, err := SignedURLPair(urlPair).Poll()
		if err != nil {
			// This can be any error at all occurs in queryAzureQueue that
			// prevents us from claiming this task.  Log, and continue.
			log.Println(err)
			continue
		}
		if task == nil {
			// no task to run, and logging done in function call, so just
			// continue...
			continue
		}
		// Now we found a task, run it, and then exit the loop. This is because
		// the loop is in order of priority, most important first, so we will
		// run the most important task we find, and then return, ignorning
		// remaining urls for lower priority tasks that might still be left to
		// loop through, since by the time we complete the first task, maybe
		// higher priority jobs are waiting, so we need to poll afresh.
		log.Println("Task found")
		taskFound = true
		// If there is one or more messages the worker must claim the tasks
		// referenced in the messages, and delete the messages.
		err = task.claim()
		if err != nil {
			log.Printf("WARN: Not able to claim task %v\n", task.TaskId)
			log.Println(err)
			task.reportException("claim-failure")
			continue
		}
		task.setReclaimTimer()
		err = task.fetchTaskDefinition()
		if err != nil {
			log.Printf("WARN: Not able to fetch task definition for task %v\n", task.TaskId)
			log.Println(err)
			task.reportException("fetch-definition-failure")
			continue
		}
		err = task.validatePayload()
		if err != nil {
			log.Printf("WARN: Not able to validate task payload for task %v\n", task.TaskId)
			log.Println(err)
			task.reportException("malformed-payload")
			continue
		}
		err = task.run()
		// task.run reports result, so no need to do it below...
		if err != nil {
			log.Printf("WARN: Not able to run task %v\n", task.TaskId)
			log.Println(err)
			continue
		}
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
	resp, _, err := httpbackoff.Get(urlPair.SignedPollUrl + "&numofmessages=1")
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
		log.Printf("ERROR: not able to xml decode the response from the azure Queue:")
		log.Printf("%v\n", string(fullBody))
		return nil, err
	}
	if len(queueMessagesList.QueueMessages) == 0 {
		log.Println("Zero tasks returned in Azure XML QueueMessagesList")
		return nil, nil
	}
	if size := len(queueMessagesList.QueueMessages); size > 1 {
		return nil, fmt.Errorf("%v tasks returned in Azure XML QueueMessagesList, even though &numofmessages=1 was specified in poll url", size)
	}

	// at this point we know there is precisely one QueueMessage (== task)
	qm := queueMessagesList.QueueMessages[0]

	// Utility method for replacing a placeholder within a uri with
	// a string value which first must be uri encoded...
	detokeniseUri := func(uri, placeholder, rawValue string) string {
		return strings.Replace(uri, placeholder, strings.Replace(url.QueryEscape(rawValue), "+", "%20", -1), -1)
	}

	// Before using the signedDeleteUrl the worker must replace the placeholder
	// {{messageId}} with the contents of the <MessageId> tag. It is also
	// necessary to replace the placeholder {{popReceipt}} with the URI encoded
	// contents of the <PopReceipt> tag.  Notice, that the worker must URI
	// encode the contents of <PopReceipt> before substituting into the
	// signedDeleteUrl. Otherwise, the worker will experience intermittent
	// failures.

	// Since urlPair is a value, not a pointer, we can update this copy which
	// is associated only with this particular task
	urlPair.SignedDeleteUrl = detokeniseUri(
		detokeniseUri(
			urlPair.SignedDeleteUrl,
			"{{messageId}}",
			qm.MessageId,
		),
		"{{popReceipt}}",
		qm.PopReceipt,
	)

	// Workers should read the value of the `<DequeueCount>` and log messages
	// that alert the operator if a message has been dequeued a significant
	// number of times, for example 15 or more.
	if qm.DequeueCount >= 15 {
		log.Printf("WARN: Queue Message with message id %v has been dequeued %v times!", qm.MessageId, qm.DequeueCount)
		deleteErr := deleteFromAzure(urlPair.SignedDeleteUrl)
		if deleteErr != nil {
			log.Printf("WARN: Not able to call Azure delete URL %v" + urlPair.SignedDeleteUrl)
			log.Printf("%v\n", deleteErr)
		}
	}

	// To find the task referenced in a message the worker must base64
	// decode and JSON parse the contents of the <MessageText> tag. This
	// would return an object on the form: {taskId, runId}.
	m, err := base64.StdEncoding.DecodeString(qm.MessageText)
	if err != nil {
		// try to delete from Azure, if it fails, nothing we can do about it
		// not very serious - another worker will try to delete it
		log.Printf("ERROR: Not able to base64 decode the Message Text '" + qm.MessageText + "' in Azure QueueMessage response.")
		log.Printf("Deleting from Azure queue as other workers will have the same problem.")
		deleteErr := deleteFromAzure(urlPair.SignedDeleteUrl)
		if deleteErr != nil {
			log.Printf("WARN: Not able to call Azure delete URL %v" + urlPair.SignedDeleteUrl)
			log.Printf("%v\n", deleteErr)
		}
		return nil, err
	}

	// initialise fields of TaskRun not contained in json string m
	taskRun := TaskRun{
		QueueMessage:  qm,
		SignedURLPair: urlPair,
	}

	// now populate remaining json fields of TaskRun from json string m
	err = json.Unmarshal(m, &taskRun)
	if err != nil {
		log.Printf("Not able to unmarshal json from base64 decoded MessageText '%v'\n%v\n", m, err)
		deleteErr := deleteFromAzure(urlPair.SignedDeleteUrl)
		if deleteErr != nil {
			log.Printf("WARN: Not able to call Azure delete URL %v" + urlPair.SignedDeleteUrl)
			log.Printf("%v\n", deleteErr)
		}
		return nil, err
	}

	return &taskRun, nil
}

// Claims the given task
func (task *TaskRun) claim() error {

	// create payload for API call for claiming task
	task.TaskClaimRequest = queue.TaskClaimRequest{
		WorkerGroup: os.Getenv("WORKER_GROUP"),
		WorkerId:    os.Getenv("WORKER_ID"),
	}

	// Using the taskId and runId from the <MessageText> tag, the worker
	// must call queue.claimTask().
	tcrsp, callSummary := Queue.ClaimTask(task.TaskId, fmt.Sprintf("%d", task.RunId), &task.TaskClaimRequest)
	task.ClaimCallSummary = *callSummary

	// check if an error occurred...
	if callSummary.Error != nil {
		// If the queue.claimTask() operation fails with a 4xx error, the
		// worker must delete the messages from the Azure queue (except 401).
		switch {
		case callSummary.HttpResponse.StatusCode == 401:
			log.Printf("Whoops - not authorized to claim task %v, *not* deleting it from Azure queue!\n", task.TaskId)
		case callSummary.HttpResponse.StatusCode/100 == 4:
			// attempt to delete, but if it fails, log and continue
			// nothing we can do, and better to return the first 4xx error
			err := task.deleteFromAzure()
			if err != nil {
				log.Printf("Not able to delete task %v from Azure after receiving http status code %v when claiming it.\n", task.TaskId, callSummary.HttpResponse.StatusCode)
				log.Println(err)
			}
		}
		log.Println(task.String())
		log.Println(callSummary.Error)
		return callSummary.Error
	}

	task.TaskClaimResponse = *tcrsp

	err := task.deleteFromAzure()
	if err != nil {
		return err
	}

	return nil
}

// deleteFromAzure will attempt to delete a task from the Azure queue and
// return an error in case of failure
func (task *TaskRun) deleteFromAzure() error {
	if task == nil {
		return fmt.Errorf("Cannot delete task from Azure - task is nil")
	}
	log.Println("Deleting task " + task.TaskId + " from Azure queue...")
	return deleteFromAzure(task.SignedURLPair.SignedDeleteUrl)
}

// deleteFromAzure is a wrapper around calling an Azure delete URL with error
// handling in case of failure
func deleteFromAzure(deleteUrl string) error {

	// Messages are deleted from the Azure queue with a DELETE request to the
	// signedDeleteUrl from the Azure queue object returned from
	// queue.pollTaskUrls.

	// Also remark that the worker must delete messages if the queue.claimTask
	// operations fails with a 4xx error. A 400 hundred range error implies
	// that the task wasn't created, not scheduled or already claimed, in
	// either case the worker should delete the message as we don't want
	// another worker to receive message later.

	httpCall := func() (*http.Response, error, error) {
		req, err := http.NewRequest("DELETE", deleteUrl, nil)
		if err != nil {
			return nil, nil, err
		}
		resp, err := http.DefaultClient.Do(req)
		return resp, err, nil
	}

	resp, _, err := httpbackoff.Retry(httpCall)

	// Notice, that failure to delete messages from Azure queue is serious, as
	// it wouldn't manifest itself in an immediate bug. Instead if messages
	// repeatedly fails to be deleted, it would result in a lot of unnecessary
	// calls to the queue and the Azure queue. The worker will likely continue
	// to work, as the messages eventually disappears when their deadline is
	// reached. However, the provisioner would over-provision aggressively as
	// it would be unable to tell the number of pending tasks. And the worker
	// would spend a lot of time attempting to claim faulty messages. For these
	// reasons outlined above it's strongly advised that workers logs failures
	// to delete messages from Azure queues.
	if err != nil {
		return fmt.Errorf("Not able to delete task from azure queue (delete url: %v)\n%v\n", deleteUrl, err)
	} else {
		log.Printf("Successfully deleted task from azure queue (delete url: %v) with http response code %v.\n", deleteUrl, resp.StatusCode)
	}
	// no errors occurred, yay!
	return nil
}

func (task *TaskRun) reclaim() {
	fmt.Printf("Reclaiming task %v...\n", task.TaskId)
	tcrsp, callSummary := Queue.ReclaimTask(task.TaskId, fmt.Sprintf("%d", task.RunId))

	// check if an error occurred...
	if err := callSummary.Error; err != nil {
		log.Printf("%v\n", err)
		task.abort("Cancelling task due to above error when reclaiming...")
		log.Println(task.String())
		return
	}

	task.TaskClaimResponse = *tcrsp
	task.ClaimCallSummary = *callSummary
	log.Printf("Reclaimed task %v successfully (http response code %v).\n", task.TaskId, callSummary.HttpResponse.StatusCode)
}

func (task *TaskRun) abort(reason string) error {
	log.Printf("Aborting task %v due to: %v...\n", task.TaskId, reason)
	// TODO: implement!
	return nil
}

func (task *TaskRun) setReclaimTimer() {
	// Reclaiming Tasks
	// ----------------
	// When the worker has claimed a task, it's said to have a claim to a given
	// `taskId`/`runId`. This claim has an expiration, see the `takenUntil` property
	// in the _task status structure_ returned from `queue.claimTask` and
	// `queue.reclaimTask`. A worker must call `queue.reclaimTask` before the claim
	// denoted in `takenUntil` expires. It's recommended that this attempted a few
	// minutes prior to expiration, to allow for clock drift.

	takenUntil := task.TaskClaimResponse.Status.Runs[task.RunId].TakenUntil
	// Attempt to reclaim 3 mins earlier...
	reclaimTime := takenUntil.Add(time.Minute * -3)
	waitTimeUntilReclaim := reclaimTime.Sub(time.Now())
	task.reclaimTimer = time.AfterFunc(waitTimeUntilReclaim, task.reclaim)
}

func (task *TaskRun) fetchTaskDefinition() error {
	// Fetch task definition
	definition, callSummary := Queue.Task(task.TaskId)
	if err := callSummary.Error; err != nil {
		return err
	}
	task.Definition = *definition
	log.Printf("Successfully retrieved Task Definition (http response code %v)\n", callSummary.HttpResponse.StatusCode)
	return nil
}

func (task *TaskRun) validatePayload() error {
	// To get payload, first marshal task.Definition.Payload into json
	// (currently it is a map[string]json.RawMessage).
	unmarshaledPayload := make(map[string]interface{})
	for i, j := range task.Definition.Payload {
		var x interface{} = nil
		err := json.Unmarshal(j, &x)
		if err != nil {
			return err
		}
		unmarshaledPayload[i] = x
	}
	jsonPayload, err := json.Marshal(unmarshaledPayload)
	// It shouldn't be possible to get an error here, since we are marshaling a
	// subset of something we previously unmarshaled - but never say never...
	if err != nil {
		return err
	}
	log.Printf("Json Payload: %v\n", string(jsonPayload))
	schemaLoader := gojsonschema.NewReferenceLoader("file://" + os.Getenv("PAYLOAD_SCHEMA"))
	docLoader := gojsonschema.NewStringLoader(string(jsonPayload))
	result, err := gojsonschema.Validate(schemaLoader, docLoader)
	if err != nil {
		return err
	}
	if result.Valid() {
		log.Printf("The task payload is valid.\n")
	} else {
		log.Printf("The task payload is invalid. See errors:\n")
		for _, desc := range result.Errors() {
			log.Printf("- %s\n", desc)
		}
		// Dealing with Invalid Task Payloads
		// ----------------------------------
		// If the task payload is malformed or invalid, keep in mind that the
		// queue doesn't validate the contents of the `task.payload` property,
		// the worker may resolve the current run by reporting an exception.
		// When reporting an exception, using `queue.reportException` the
		// worker should give a `reason`. If the worker is unable execute the
		// task specific payload/code/logic, it should report exception with
		// the reason `malformed-payload`.
		if err := task.reportException("malformed-payload"); err != nil {
			log.Printf("Error occurred reporting exception for task %v:\n%v\n", task.TaskId, err)
		}
		return fmt.Errorf("Validation of payload failed for task %v", task.TaskId)
	}
	return json.Unmarshal(jsonPayload, &task.Payload)
}

func (task *TaskRun) reportException(reason string) error {
	ter := queue.TaskExceptionRequest{Reason: json.RawMessage(`"` + reason + `"`)}
	tsr, callSummary := Queue.ReportException(task.TaskId, strconv.FormatInt(int64(task.RunId), 10), &ter)
	if callSummary.Error != nil {
		log.Printf("Not able to report exception for task %v:\n%v", task.TaskId, callSummary.Error)
		return callSummary.Error
	}
	task.TaskClaimResponse.Status = tsr.Status
	log.Println(task.String())
	return nil
}

func (task *TaskRun) reportFailed() error {
	tsr, callSummary := Queue.ReportFailed(task.TaskId, strconv.FormatInt(int64(task.RunId), 10))
	if callSummary.Error != nil {
		log.Printf("Not able to report failed completion for task %v:\n%v", task.TaskId, callSummary.Error)
		return callSummary.Error
	}
	task.TaskClaimResponse.Status = tsr.Status
	log.Println(task.String())
	return nil
}

func (task *TaskRun) reportCompleted() error {
	log.Printf("Command finished successfully!")
	tsr, callSummary := Queue.ReportCompleted(task.TaskId, strconv.FormatInt(int64(task.RunId), 10))
	if callSummary.Error != nil {
		log.Printf("Not able to report successful completion for task %v:\n%v", task.TaskId, callSummary.Error)
		return callSummary.Error
	}
	task.TaskClaimResponse.Status = tsr.Status
	log.Println(task.String())
	return nil
}

func (task *TaskRun) run() error {

	fmt.Println("Running task!")
	fmt.Println(task.String())
	cmd := task.generateCommand() // platform specific
	err := cmd.Start()
	if err != nil {
		return err
	}
	log.Printf("Waiting for command to finish...")
	// start a go routine to kill task after max run time...
	go func() {
		time.Sleep(time.Second * time.Duration(task.Payload.MaxRunTime))
		task.abort("max run time (" + strconv.Itoa(task.Payload.MaxRunTime) + "s) exceeded")
	}()
	err = cmd.Wait()
	// Reporting Task Result
	// ---------------------
	// If a task is malformed, the input is invalid, configuration is wrong, or
	// the worker is told to shutdown by AWS before the the task is completed,
	// it should be reported to the queue using `queue.reportException`.
	if err != nil {
		// If the task is unsuccessful, ie. exits non-zero, the worker should
		// resolve it using `queue.reportFailed` (this implies test or build
		// failure).
		switch err.(type) {
		case *exec.ExitError:
			return task.reportFailed()
		}

		log.Printf("Command finished with error: %v", err)
		return task.reportException("task-crash")
	}
	// When the worker has completed the task successfully it should call
	// `queue.reportCompleted`.
	return task.reportCompleted()
}

func (task *TaskRun) prepEnvVars(cmd *exec.Cmd) {
	workerEnv := os.Environ()
	taskEnv := make([]string, 0)
	for _, j := range workerEnv {
		if !strings.HasPrefix(j, "TASKCLUSTER_ACCESS_TOKEN=") {
			fmt.Printf("Setting env var: %v\n", j)
			taskEnv = append(taskEnv, j)
		}
	}
	for i, j := range task.Payload.Env {
		fmt.Printf("Setting env var: %v=%v\n", i, j)
		taskEnv = append(taskEnv, i+"="+j)
	}
	cmd.Env = taskEnv
	log.Printf("Environment: %v\n", taskEnv)
}

// This can also be used if an external resource that is referenced in a
// declarative nature doesn't exist. Generally, it should be used if we can be
// certain that another run of the task will have the same result. This differs
// from `queue.reportFailure` in the sense that we report a failure if the task
// specific code failed.
//
// Most tasks includes a lot of declarative steps, such as poll a docker image,
// create cache folder, decrypt encrypted environment variables, set
// environment variables and etc. Clearly, if decryption of environment
// variables fail, there is no reason to retry the task. Nor can it be said
// that the task failed, because the error wasn't cause by execution of Turing
// complete code.
//
// If however, we run some executable code referenced in `task.payload` and the
// code crashes or exists non-zero, then the task is said to be failed. The
// difference is whether or not the unexpected behavior happened before or
// after the execution of task specific Turing complete code.
//
//
// Terminating the Worker Early
// ----------------------------
// If the worker finds itself having to terminate early, for example a spot
// nodes that detects pending termination. Or a physical machine ordered to be
// provisioned for another purpose, the worker should report exception with the
// reason `worker-shutdown`. Upon such report the queue will resolve the run as
// exception and create a new run, if the task has additional retries left.
//
//
