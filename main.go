package main

import (
	"fmt"
	"github.com/taskcluster/taskcluster-client-go/queue"
	// "github.com/taskcluster/taskcluster-client-go/queueevents"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

var (
	// Queue is the object we will use for accessing queue api
	Queue *queue.Auth
	// signedUrlsChan is a channel you can pass a channel to, to get back
	// signed urls from the Task Cluster Queue, for querying Azure queues.
	// See SignedURLsManager().
	signedUrlsChan chan chan *queue.PollTaskUrlsResponse = make(chan chan *queue.PollTaskUrlsResponse)
)

// This is what the Azure XML looks like...
// <?xml version="1.0" encoding="UTF-8"?>
// <QueueMessagesList>
//   <QueueMessage>
//     <MessageId>da4e392d-f7a1-4a7b-aa58-f1dd2981cd7a</MessageId>
//     <InsertionTime>Tue, 10 Mar 2015 12:11:53 GMT</InsertionTime>
//     <ExpirationTime>Tue, 10 Mar 2015 13:11:46 GMT</ExpirationTime>
//     <DequeueCount>1</DequeueCount>
//     <PopReceipt>AgAAAAMAAAAAAAAApBbnHCxb0AE=</PopReceipt>
//     <TimeNextVisible>Tue, 10 Mar 2015 12:17:01 GMT</TimeNextVisible>
//     <MessageText>eyJ0YXNrSWQiOiJ2cWU0VE5sclJEMlREUHNNWExKclhRIiwicnVuSWQiOjB9</MessageText>
//   </QueueMessage>
// </QueueMessagesList>

type QueueMessagesList struct {
	XMLName       xml.Name       `xml:"QueueMessagesList"`
	QueueMessages []QueueMessage `xml:"QueueMessage"`
}

type QueueMessage struct {
	XMLName         xml.Name        `xml:"QueueMessage"`
	MessageId       string          `xml:"MessageId"`
	InsertionTime   azureTimeFormat `xml:"InsertionTime"`
	ExpirationTime  azureTimeFormat `xml:"ExpirationTime"`
	DequeueCount    uint            `xml:"DequeueCount"`
	PopReceipt      string          `xml:"PopReceipt"`
	TimeNextVisible azureTimeFormat `xml:"TimeNextVisible"`
	MessageText     string          `xml:"MessageText"`
}

type TaskRun struct {
	TaskId string `json:"taskId"`
	RunId  uint   `json:"runId"`
}

// Custom time format to enable unmarshalling of azure xml directly into go
// object with native go time.Time implementation under-the-hood
type azureTimeFormat struct {
	time.Time
}

// This function is called in a dedicated go routine to both serve signed urls
// and to update them before they expire
func SignedURLsManager() {
	prematurity := os.Getenv("REFRESH_URLS_PREMATURELY_SECS")
	premInt, err := strconv.Atoi(prematurity)
	if err != nil {
		log.Printf("Environment variable REFRESH_URLS_PREMATURELY_SECS should be an integer number of seconds, but is '%v'.", prematurity)
		log.Fatalf("This variable represents the number of seconds before signed URLs expire, that they should be refreshed.")
	}
	// signedUrls is the variable where we store the current valid signed urls
	var signedUrls *queue.PollTaskUrlsResponse
	// updateMe is a channel to send a message to when we need to update signed
	// urls because either we don't have any yet (i.e. first time) or they are
	// about to expire...
	updateMe := make(<-chan time.Time)
	// function to update signed urls
	updateUrls := func() {
		// get new urls
		signedUrls, _ = Queue.PollTaskUrls(os.Getenv("PROVISIONER_ID"), os.Getenv("WORKER_TYPE"))
		// Set reminder to update signed urls again when they are
		// approximately REFRESH_URLS_PREMATURELY_SECS seconds before
		// expiring...
		// We do this by updating updateMe channel, so that on future
		// iterations of this select statement, we read from this new
		// channel.
		updateMe = time.After(signedUrls.Expires.Sub(time.Now().Add(time.Second * time.Duration(premInt))))
		for _, q := range signedUrls.Queues {
			log.Println("  Delete URL: " + q.SignedDeleteUrl)
			log.Println("  Poll URL:   " + q.SignedPollUrl)
		}
	}
	// Get signed urls for the first time...
	updateUrls()
	// loop forever, serving requests for signed urls, or requests to refresh
	// signed urls since they are about to expire...
	for {
		select {
		// request comes in for the current signed urls, which should be valid
		case replyChan := <-signedUrlsChan:
			// reply on the given channel with the signed urls
			replyChan <- signedUrls
		// this is where we are notified that our signed urls are shorlty
		// before expiring, so we need to refresh them...
		case <-updateMe:
			updateUrls()
		}
	}
}

// Custom Unmarshaller in order to interpret time formats in the azure expected format
func (c *azureTimeFormat) UnmarshalXML(d *xml.Decoder, start xml.StartElement) error {
	const shortForm = "Mon, 2 Jan 2006 15:04:05 MST" // date format of azure xml responses
	var v string
	d.DecodeElement(&v, &start)
	parse, err := time.Parse(shortForm, v)
	*c = azureTimeFormat{parse}
	return err
}

// Entry point into the generic worker!
func main() {
	// make sure all reqd env variables have been set...
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

	// start the SignedURLsManager off in a dedicated go routing, to take care
	// of keeping signed urls up-to-date (i.e. refreshing as old urls expire)
	go SignedURLsManager()

	// a channel to receive signed urls on...
	c := make(chan *queue.PollTaskUrlsResponse)

	// loop forever claiming and running tasks!
	for {
		// write to the signed urls channel, to request signed urls back on
		// channel c
		signedUrlsChan <- c
		// read the result
		signedUrls := <-c
		// We got some Azure urls back - let's loop through them in order until
		// we find a task to execute. Once we find one, run it, and then exit
		// the loop.  This is because the loop is in order of priority, most
		// important first, so we will run the most important jobs (tasks) and
		// then return to polling the queue, ignorning remaining urls for lower
		// priority tasks that might still be left to loop through, since by
		// the time we complete the task, maybe higher priority jobs are
		// waiting.
		taskFound := false
		for _, q := range signedUrls.Queues {
			// this is where we will store the messages we get back from the
			// azure queue for this signed url
			queueMessagesList := new(QueueMessagesList)
			// explicitly ensure that we only get one message back - we can
			// only handle one task at a time...
			err := queryAzureQueue(q.SignedPollUrl+"&numofmessages=1", queueMessagesList)
			if err != nil {
				// log, and continue, in hope of recovery next time round
				log.Println(err)
				break
			}
			if messageCount := len(queueMessagesList.QueueMessages); messageCount == 0 {
				log.Println("  0 queue messages returned, trying next url in the list...")
			} else {
				log.Printf("  %v message(s) returned in queue...\n", messageCount)
				taskFound = true
				for i := range queueMessagesList.QueueMessages {
					process(queueMessagesList.QueueMessages[i])
				}
				// since we processed some tasks now, let's query the queue
				// again, rather than processing remaining lower priority
				// jobs...
				break
			}
			if !taskFound {
				log.Printf("No task returned from any Azure queue...")
			}
		}
		// sleep a second before next poll
		time.Sleep(time.Second * 1)
	}
}

func process(message QueueMessage) {
}

func queryAzureQueue(pollUrl string, queueMessagesList *QueueMessagesList) error {
	resp, err := http.Get(pollUrl)
	if err != nil {
		log.Println(err)
		return err
	}
	fullBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	// fmt.Println("")
	// fmt.Println("  XML Received")
	// fmt.Println("  ============")
	// fmt.Println(string(fullBody))
	// fmt.Println("  ==================================")
	reader := strings.NewReader(string(fullBody))
	dec := xml.NewDecoder(reader)
	err = dec.Decode(&queueMessagesList)
	if err != nil {
		return err
	}
	// fmt.Printf("    %v of type %T\n", queueMessagesList, queueMessagesList)
	// fmt.Println("")

	// If there is one or more messages the worker must claim the tasks
	// referenced in the messages, and delete the messages.
	for i, j := range queueMessagesList.QueueMessages {
		fmt.Printf("Entry %v:\n", i)
		fmt.Printf("  Message Id:            %v\n", j.MessageId)
		fmt.Printf("  Insertion Time:        %v\n", j.InsertionTime)
		fmt.Printf("  Expiration Time:       %v\n", j.ExpirationTime)
		fmt.Printf("  Dequeue Count:         %v\n", j.DequeueCount)
		fmt.Printf("  Pop Receipt:           %v\n", j.PopReceipt)
		fmt.Printf("  Time Next Visible:     %v\n", j.TimeNextVisible)
		fmt.Printf("  Message Text:          %v\n", j.MessageText)

		// To find the task referenced in a message the worker must base64
		// decode and JSON parse the contents of the <MessageText> tag. This
		// would return an object on the form: {taskId, runId}.
		m, err := base64.StdEncoding.DecodeString(j.MessageText)
		if err != nil {
			return err
		}
		messageText := string(m)
		fmt.Printf("  Decoded Message Text:  %v\n", messageText)
		taskRun := TaskRun{}
		err = json.Unmarshal(m, &taskRun)
		if err != nil {
			return err
		}
		fmt.Printf("  Task Id:               %v\n", taskRun.TaskId)
		fmt.Printf("  Run Id:                %v\n", taskRun.RunId)
		tcrq := queue.TaskClaimRequest{
			MessageId:   j.MessageId,
			Receipt:     j.PopReceipt,
			Token:       taskRun.TaskId, // ??? <- already in the url route, also needed in payload?
			WorkerGroup: "Germany",
			WorkerId:    "MysteryWorkerX",
		}

		// Using the taskId and runId from the <MessageText> tag, the worker
		// must call queue.claimTask().
		tcrsp, resp := Queue.ClaimTask(taskRun.TaskId, fmt.Sprintf("%d", taskRun.RunId), &tcrq)

		// If the queue.claimTask() operation is successful or fails with a 4xx
		// error, the worker must delete the messages from the Azure queue.
		if (400 <= resp.StatusCode && resp.StatusCode < 500) || resp.StatusCode == 200 {

			// Messages are deleted from the Azure queue with a DELETE request
			// to the signedDeleteUrl from the Azure queue object returned from
			// queue.pollTaskUrls. Before using the signedDeleteUrl the worker
			// must replace the placeholder {{messageId}} with the contents of
			// the <MessageId> tag. It is also necessary to replace the
			// placeholder {{popReceipt}} with the URI encoded contents of the
			// <PopReceipt> tag.
			defer deleteFromAzure()
		}

		fmt.Println("-----------")
		fmt.Printf("  Status Code:           %v\n", resp.StatusCode)

		responseBody, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		fmt.Printf("  Response:              %v\n", string(responseBody))
		requestBody, err := ioutil.ReadAll(resp.Request.Body)
		if err != nil {
			return err
		}
		fmt.Printf("  Request:               %v\n", string(requestBody))
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
	}
	return nil
}

func deleteFromAzure() {
	log.Println("Since status code is 200 or in range [400, 500), deleting from azure queue...")
}
