package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"io/ioutil"
	"mime"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go/queue"
	D "github.com/tj/go-debug"
	"github.com/xeipuuv/gojsonschema"
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("generic-worker")
	// General platform independent user settings, such as home directory, username...
	// Platform specific data should be managed in plat_<platform>.go files
	User OSUser
	// Queue is the object we will use for accessing queue api. See
	// http://docs.taskcluster.net/queue/api-docs/
	Queue *queue.Auth
	// See SignedURLsManager() for more information:
	// signedURsRequestChan is the channel you can pass a channel to, to get
	// back signed urls from the Task Cluster Queue, for querying Azure queues.
	signedURLsRequestChan chan chan *queue.PollTaskUrlsResponse
	// The *currently* one-and-only channel we request signedURLs to be written
	// to. In future we might require more channels to perform requests in
	// parallel, in which case we won't have a single global package var.
	signedURLsResponseChan chan *queue.PollTaskUrlsResponse
	// Channel to request task status updates to the TaskStatusHandler (from
	// any goroutine)
	taskStatusUpdate chan<- TaskStatusUpdate
	// Channel to read errors from after requesting a task status update on
	// taskStatusUpdate channel
	taskStatusUpdateErr <-chan error
)

// Entry point into the generic worker...
func main() {
	// Any custom startup per platform...
	err := startup()
	// any errors are fatal
	if err != nil {
		panic(err)
	}
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
			debug("Environment variable %v must be set.", j)
			os.Exit(1)
		}
	}

	// Queue is the object we will use for accessing queue api
	Queue = queue.New(os.Getenv("TASKCLUSTER_CLIENT_ID"), os.Getenv("TASKCLUSTER_ACCESS_TOKEN"))

	// Start the SignedURLsManager in a dedicated go routine, to take care of
	// keeping signed urls up-to-date (i.e. refreshing as old urls expire).
	signedURLsRequestChan, signedURLsResponseChan = SignedURLsManager()

	// Start the TaskStatusHandler in a dedicated go routine, to take care of
	// all communication with Queue regarding the status of a TaskRun.
	taskStatusUpdate, taskStatusUpdateErr = TaskStatusHandler()

	// loop forever claiming and running tasks!
	for {
		// make sure at least 1 second passes between iterations
		waitASec := time.NewTimer(time.Second * 1)
		taskFound := FindAndRunTask()
		if !taskFound {
			debug("No task claimed from any Azure queue...")
		} else {
			taskCleanup()
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
			debug("%v", err)
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
		debug("Task found")

		// from this point on we should "break" rather than "continue", since
		// there could be more tasks on the same queue - we only "continue"
		// to next queue if we found nothing on this queue...
		taskFound = true

		// If there is one or more messages the worker must claim the tasks
		// referenced in the messages, and delete the messages.
		taskStatusUpdate <- TaskStatusUpdate{
			Task:   task,
			Status: Claimed,
		}
		err = <-taskStatusUpdateErr
		if err != nil {
			debug("WARN: Not able to claim task %v", task.TaskId)
			debug("%v", err)
			break
		}
		task.setReclaimTimer()
		err = task.fetchTaskDefinition()
		if err != nil {
			debug("TASK EXCEPTION: Not able to fetch task definition for task %v", task.TaskId)
			debug("%v", err)
			taskStatusUpdate <- TaskStatusUpdate{
				Task:   task,
				Status: Errored,
				Reason: "worker-shutdown", // "fetch-definition-failure"
			}
			reportPossibleError(<-taskStatusUpdateErr)
			break
		}
		err = task.validatePayload()
		if err != nil {
			debug("TASK EXCEPTION: Not able to validate task payload for task %v", task.TaskId)
			debug("%#v", err)
			taskStatusUpdate <- TaskStatusUpdate{
				Task:   task,
				Status: Errored,
				Reason: "malformed-payload", // "invalid-payload"
			}
			reportPossibleError(<-taskStatusUpdateErr)
			break
		}
		err = task.run()
		reportPossibleError(err)
		break
	}
	return taskFound
}

func reportPossibleError(err error) {
	if err != nil {
		debug("%v", err)
	}
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
		debug("%v", err)
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
		debug("ERROR: not able to xml decode the response from the azure Queue:")
		debug(string(fullBody))
		return nil, err
	}
	if len(queueMessagesList.QueueMessages) == 0 {
		debug("Zero tasks returned in Azure XML QueueMessagesList")
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
		debug("WARN: Queue Message with message id %v has been dequeued %v times!", qm.MessageId, qm.DequeueCount)
		deleteErr := deleteFromAzure(urlPair.SignedDeleteUrl)
		if deleteErr != nil {
			debug("WARN: Not able to call Azure delete URL %v" + urlPair.SignedDeleteUrl)
			debug("%v", deleteErr)
		}
	}

	// To find the task referenced in a message the worker must base64
	// decode and JSON parse the contents of the <MessageText> tag. This
	// would return an object on the form: {taskId, runId}.
	m, err := base64.StdEncoding.DecodeString(qm.MessageText)
	if err != nil {
		// try to delete from Azure, if it fails, nothing we can do about it
		// not very serious - another worker will try to delete it
		debug("ERROR: Not able to base64 decode the Message Text '" + qm.MessageText + "' in Azure QueueMessage response.")
		debug("Deleting from Azure queue as other workers will have the same problem.")
		deleteErr := deleteFromAzure(urlPair.SignedDeleteUrl)
		if deleteErr != nil {
			debug("WARN: Not able to call Azure delete URL %v" + urlPair.SignedDeleteUrl)
			debug("%v", deleteErr)
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
		debug("Not able to unmarshal json from base64 decoded MessageText '%v'", m)
		debug("%v", err)
		deleteErr := deleteFromAzure(urlPair.SignedDeleteUrl)
		if deleteErr != nil {
			debug("WARN: Not able to call Azure delete URL %v" + urlPair.SignedDeleteUrl)
			debug("%v", deleteErr)
		}
		return nil, err
	}

	return &taskRun, nil
}

// deleteFromAzure will attempt to delete a task from the Azure queue and
// return an error in case of failure
func (task *TaskRun) deleteFromAzure() error {
	if task == nil {
		return fmt.Errorf("Cannot delete task from Azure - task is nil")
	}
	debug("Deleting task " + task.TaskId + " from Azure queue...")
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
		debug("Not able to delete task from azure queue (delete url: %v)", deleteUrl)
		debug("%v", err)
		return err
	} else {
		debug("Successfully deleted task from azure queue (delete url: %v) with http response code %v.", deleteUrl, resp.StatusCode)
	}
	// no errors occurred, yay!
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
	task.reclaimTimer = time.AfterFunc(
		waitTimeUntilReclaim, func() {
			taskStatusUpdate <- TaskStatusUpdate{
				Task:   task,
				Status: Reclaimed,
			}
			err := <-taskStatusUpdateErr
			if err != nil {
				debug("TASK EXCEPTION due to reclaim failure")
				debug("%v", err)
				taskStatusUpdate <- TaskStatusUpdate{
					Task:   task,
					Status: Errored,
					Reason: "worker-shutdown", // "reclaim-failed"
				}
				reportPossibleError(<-taskStatusUpdateErr)
				return
			}
			// only set another reclaim timer if the previous reclaim succeeded
			task.setReclaimTimer()
		},
	)
}

func (task *TaskRun) fetchTaskDefinition() error {
	// Fetch task definition
	definition, callSummary := Queue.Task(task.TaskId)
	if err := callSummary.Error; err != nil {
		return err
	}
	task.Definition = *definition
	debug("Successfully retrieved Task Definition (http response code %v)", callSummary.HttpResponse.StatusCode)
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
	debug("Json Payload: %v", string(jsonPayload))
	schemaLoader := gojsonschema.NewReferenceLoader("file://" + os.Getenv("PAYLOAD_SCHEMA"))
	docLoader := gojsonschema.NewStringLoader(string(jsonPayload))
	result, err := gojsonschema.Validate(schemaLoader, docLoader)
	if err != nil {
		return err
	}
	if result.Valid() {
		debug("The task payload is valid.")
	} else {
		debug("TASK FAIL since the task payload is invalid. See errors:")
		for _, desc := range result.Errors() {
			debug("- %s", desc)
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
		taskStatusUpdate <- TaskStatusUpdate{
			Task:   task,
			Status: Errored,
			Reason: "malformed-payload",
		}
		reportPossibleError(<-taskStatusUpdateErr)
		return fmt.Errorf("Validation of payload failed for task %v", task.TaskId)
	}
	return json.Unmarshal(jsonPayload, &task.Payload)
}

func (task *TaskRun) run() error {

	debug("Running task!")
	debug(task.String())

	// start a go routine to kill task after max run time...
	go func() {
		time.Sleep(time.Second * time.Duration(task.Payload.MaxRunTime))
		taskStatusUpdate <- TaskStatusUpdate{
			Task:   task,
			Status: Aborted,
			// only abort task if it is still running...
			IfStatusIn: map[TaskStatus]bool{Claimed: true, Reclaimed: true},
			Reason:     "malformed-payload", // "max run time (" + strconv.Itoa(task.Payload.MaxRunTime) + "s) exceeded"
		}
		reportPossibleError(<-taskStatusUpdateErr)
	}()

	task.Commands = make([]Command, len(task.Payload.Command))

	// We only report the status at the end of the method, e.g.
	// if a command fails, we still try to upload log files
	// and artifacts. Therefore use these variables to store
	// failure or exception, and at the end of the method
	// report status based on these...
	var finalTaskStatus TaskStatus = Succeeded
	var finalReason string
	var finalError error = nil
	abort := false
	var err error

	for i, _ := range task.Payload.Command {
		task.Commands[i], err = task.generateCommand(i) // platform specific
		if err != nil && finalError == nil {
			debug("TASK EXCEPTION due to not being able to generate command %v", i)
			finalTaskStatus = Errored
			finalReason = "worker-shutdown" // not really, but this is all we have at the moment
			finalError = err
			break
		}
		err = task.Commands[i].osCommand.Start()
		if err != nil && finalError == nil {
			debug("TASK EXCEPTION due to not being able to start command %v", i)
			finalTaskStatus = Errored
			finalReason = "worker-shutdown" // not really, but this is all we have at the moment
			finalError = err
			break
		}
		debug("Waiting for command to finish...")
		// use a different variable for error since we process it later
		err := task.Commands[i].osCommand.Wait()

		// Reporting Task Result
		// ---------------------
		// If a task is malformed, the input is invalid, configuration is wrong, or
		// the worker is told to shutdown by AWS before the the task is completed,
		// it should be reported to the queue using `queue.reportException`.
		if err != nil {
			// make sure we abort loop after uploading log file
			abort = true
			if finalError == nil {
				// If the task is unsuccessful, ie. exits non-zero, the worker should
				// resolve it using `queue.reportFailed` (this implies test or build
				// failure).
				switch err.(type) {
				case *exec.ExitError:
					finalTaskStatus = Failed
					finalError = err
				default:
					debug("TASK EXCEPTION due to error of type %T when executing command %v", err, i)
					debug("%#v", err)
					finalTaskStatus = Errored
					finalReason = "worker-shutdown" // should be task-crash
					finalError = err
				}
			}
		}
		err = task.uploadLog(task.Commands[i].logFile)
		if err != nil && finalError == nil {
			debug("TASK EXCEPTION due to problem uploading log %v", task.Commands[i].logFile)
			debug("%#v", err)
			finalTaskStatus = Errored
			finalReason = "worker-shutdown" // actually, a log upload failure
			finalError = err
			// don't break or abort - log upload failure alone shouldn't stop
			// other steps from running
		}
		if abort {
			break
		}
	}

	err = task.generateCompleteLog()
	if err != nil {
		if finalError == nil {
			debug("TASK EXCEPTION when generating complete log")
			debug("%#v", err)
			finalTaskStatus = Errored
			finalReason = "worker-shutdown" // should be log-concatenation-failure
			finalError = err
		}
	} else {
		// only upload if log concatenation succeeded!
		err = task.uploadLog("public/logs/all_commands.log")
		if err != nil && finalError == nil {
			debug("TASK EXCEPTION due to not being able to upload public/logs/all_commands.log")
			finalTaskStatus = Errored
			finalReason = "worker-shutdown" // should be upload-failure
			finalError = err
		}
	}
	for _, artifact := range task.PayloadArtifacts() {
		err := task.uploadArtifact(artifact)
		if err != nil && finalError == nil {
			switch t := err.(type) {
			case *os.PathError:
				// artifact does not exist or is not readable...
				finalTaskStatus = Failed
				finalError = err
			case httpbackoff.BadHttpResponseCode:
				// if not a 5xx error, then not worth retrying...
				if t.HttpResponseCode/100 != 5 {
					debug("TASK FAIL due to response code %v from Queue when uploading artifact %v", t.HttpResponseCode, artifact.CanonicalPath)
					finalTaskStatus = Failed
				} else {
					debug("TASK EXCEPTION due to response code %v from Queue when uploading artifact %v", t.HttpResponseCode, artifact.CanonicalPath)
					finalTaskStatus = Errored
					finalReason = "worker-shutdown" // should be upload-failure
				}
				finalError = err
			default:
				debug("TASK EXCEPTION due to error of type %T", t)
				debug("%#v", t)
				// could not upload for another reason
				finalTaskStatus = Errored
				finalReason = "worker-shutdown" // should be upload-failure
				finalError = err
			}
		}
	}

	// When the worker has completed the task successfully it should call
	// `queue.reportCompleted`.
	taskStatusUpdate <- TaskStatusUpdate{
		Task:   task,
		Status: finalTaskStatus,
		Reason: finalReason,
	}
	err = <-taskStatusUpdateErr
	if err != nil && finalError == nil {
		finalError = err
	}
	return finalError
}

func (task *TaskRun) generateCompleteLog() error {
	completeLogFile, err := os.Create(filepath.Join(User.HomeDir, "public", "logs", "all_commands.log"))
	if err != nil {
		return err
	}
	defer completeLogFile.Close()
	for _, command := range task.Commands {
		commandLog, err := os.Open(filepath.Join(User.HomeDir, command.logFile))
		if err != nil {
			continue // file does not exist - maybe command did not run
		}
		_, err = io.Copy(completeLogFile, commandLog)
		if err != nil {
			return err
		}
		err = commandLog.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func (task *TaskRun) uploadLog(logFile string) error {
	// logs expire after one year...
	logExpiry := time.Now().AddDate(1, 0, 0)
	return task.uploadArtifact(Artifact{CanonicalPath: logFile, Expires: logExpiry, MimeType: "text/plain"})
}

func (task *TaskRun) unixCommand(command string) (Command, error) {
	cmd := exec.Command(task.Payload.Command[0], task.Payload.Command[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	task.prepEnvVars(cmd)
	// TODO
	return Command{osCommand: cmd, logFile: ""}, nil
}

func (task *TaskRun) prepEnvVars(cmd *exec.Cmd) {
	workerEnv := os.Environ()
	taskEnv := make([]string, 0)
	for _, j := range workerEnv {
		if !strings.HasPrefix(j, "TASKCLUSTER_ACCESS_TOKEN=") {
			debug("Setting env var: %v", j)
			taskEnv = append(taskEnv, j)
		}
	}
	for i, j := range task.Payload.Env {
		debug("Setting env var: %v=%v", i, j)
		taskEnv = append(taskEnv, i+"="+j)
	}
	cmd.Env = taskEnv
	debug("Environment: %v", taskEnv)
}

func (task *TaskRun) uploadArtifact(artifact Artifact) error {
	// first check file exists!
	fileReader, err := os.Open(filepath.Join(User.HomeDir, artifact.CanonicalPath))
	if err != nil {
		return err
	}
	task.Artifacts = append(task.Artifacts, artifact)
	par := queue.PostArtifactRequest(json.RawMessage(`{"storageType": "s3", "expires": "` + artifact.Expires.UTC().Format("2006-01-02T15:04:05.000Z0700") + `", "contentType": "` + artifact.MimeType + `"}`))
	parsp, callSummary := Queue.CreateArtifact(
		task.TaskId,
		strconv.Itoa(int(task.RunId)),
		artifact.CanonicalPath,
		&par,
	)
	if callSummary.Error != nil {
		debug("Could not upload artifact: %v", artifact)
		debug("%v", callSummary)
		debug("%v", parsp)
		debug("Request Headers")
		callSummary.HttpRequest.Header.Write(os.Stdout)
		debug("Request Body")
		debug(callSummary.HttpRequestBody)
		debug("Response Headers")
		callSummary.HttpResponse.Header.Write(os.Stdout)
		debug("Response Body")
		debug(callSummary.HttpResponseBody)
		return callSummary.Error
	}
	debug("Response body RAW")
	debug(callSummary.HttpResponseBody)
	debug("Response body INTERPRETED")
	debug(string(*parsp))
	// unmarshal response into object
	resp := new(S3ArtifactResponse)
	err = json.Unmarshal(json.RawMessage(*parsp), resp)
	if err != nil {
		return err
	}
	httpClient := &http.Client{}
	httpCall := func() (*http.Response, error, error) {
		// instead of using fileReader, read it into memory and then use a
		// bytes.Reader since then http.NewRequest will properly set
		// Content-Length header for us, which is needed by the API we call
		requestPayload, err := ioutil.ReadAll(fileReader)
		if err != nil {
			return nil, nil, err
		}
		bytesReader := bytes.NewReader(requestPayload)
		// http.NewRequest automatically sets Content-Length correctly for bytes.Reader
		httpRequest, err := http.NewRequest("PUT", resp.PutURL, bytesReader)
		if err != nil {
			return nil, nil, err
		}
		httpRequest.Header.Set("Content-Type", artifact.MimeType)
		// request body could be a) binary and b) massive, so don't show it...
		requestFull, dumpError := httputil.DumpRequestOut(httpRequest, false)
		if dumpError != nil {
			debug("Could not dump request, never mind...")
		} else {
			debug("Request")
			debug(string(requestFull))
		}
		putResp, err := httpClient.Do(httpRequest)
		return putResp, err, nil
	}
	putResp, putAttempts, err := httpbackoff.Retry(httpCall)
	if err != nil {
		return err
	}
	debug("%v put requests issued to %v", putAttempts, resp.PutURL)
	respBody, dumpError := httputil.DumpResponse(putResp, true)
	if dumpError != nil {
		debug("Could not dump response output, never mind...")
	} else {
		debug("Response")
		debug(string(respBody))
	}
	return nil
}

// Returns the artifacts as listed in the payload of the task (note this does
// not include log files)
func (task *TaskRun) PayloadArtifacts() []Artifact {
	artifacts := make([]Artifact, len(task.Payload.Artifacts))
	for i, artifact := range task.Payload.Artifacts {
		artifacts[i] = Artifact{CanonicalPath: canonicalPath(artifact.Path), Expires: artifact.Expires, MimeType: mime.TypeByExtension(filepath.Ext(artifact.Path))}
	}
	return artifacts
}

// The Queue expects paths to use a forward slash, so let's make sure we have a
// way to generate a path in this format
func canonicalPath(path string) string {
	if os.PathSeparator == '/' {
		return path
	}
	return strings.Replace(path, string(os.PathSeparator), "/", -1)
}

// This can also be used if an external resource that is referenced in a
// declarative nature doesn't exist. Generally, it should be used if we can be
// certain that another run of the task will have the same result. This differs
// from `queue.reportFailed` in the sense that we report a failure if the task
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
