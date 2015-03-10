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
	"strings"
	"time"
)

// XML looks like this:
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

type TaskRun struct {
	TaskId string `json:"taskId"`
	RunId  uint   `json:"runId"`
}

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

type azureTimeFormat struct {
	time.Time
}

func (c *azureTimeFormat) UnmarshalXML(d *xml.Decoder, start xml.StartElement) error {
	const shortForm = "Mon, 2 Jan 2006 15:04:05 MST" // date format of azure xml responses
	var v string
	d.DecodeElement(&v, &start)
	parse, err := time.Parse(shortForm, v)
	*c = azureTimeFormat{parse}
	return err
}

func main() {
	Queue := queue.New(os.Getenv("TASKCLUSTER_CLIENT_ID"), os.Getenv("TASKCLUSTER_ACCESS_TOKEN"))
	poll, _ := Queue.PollTaskUrls("pete-provisioner", "g1")
	exp := poll.Expires
	queues := poll.Queues
	fmt.Printf("Expires: %v\n", exp.String())
	fmt.Printf("%v url pairs given, trying them in order...\n", len(queues))
	for _, q := range queues {
		queueMessagesList := new(QueueMessagesList)
		delUrl := q.SignedDeleteUrl
		pollUrl := q.SignedPollUrl
		fmt.Println("  Delete URL: " + delUrl)
		fmt.Println("  Poll URL:   " + pollUrl)
		// retry poll url maximum of 5 times, in case of intermittent issues
		// with exponential drop off of 1s, 2s, 4s, 8s, 16s...
		for attempts := uint(0); attempts < 5; attempts++ {
			resp, err := http.Get(pollUrl)
			if err == nil {
				fullBody, err := ioutil.ReadAll(resp.Body)
				fmt.Println("")
				fmt.Println("  XML Received")
				fmt.Println("  ============")
				fmt.Println(string(fullBody))
				fmt.Println("  ==================================")
				if err == nil {
					reader := strings.NewReader(string(fullBody))
					dec := xml.NewDecoder(reader)
					err = dec.Decode(&queueMessagesList)
					if err == nil {
						fmt.Printf("    %v of type %T\n", queueMessagesList, queueMessagesList)
						fmt.Println("")
						for i, j := range queueMessagesList.QueueMessages {
							fmt.Printf("Entry %v:\n", i)
							fmt.Printf("  Message Id:            %v\n", j.MessageId)
							fmt.Printf("  Insertion Time:        %v\n", j.InsertionTime)
							fmt.Printf("  Expiration Time:       %v\n", j.ExpirationTime)
							fmt.Printf("  Dequeue Count:         %v\n", j.DequeueCount)
							fmt.Printf("  Pop Receipt:           %v\n", j.PopReceipt)
							fmt.Printf("  Time Next Visible:     %v\n", j.TimeNextVisible)
							fmt.Printf("  Message Text:          %v\n", j.MessageText)
							m, err := base64.StdEncoding.DecodeString(j.MessageText)
							if err == nil {
								messageText := string(m)
								fmt.Printf("  Decoded Message Text:  %v\n", messageText)
								taskRun := TaskRun{}
								err = json.Unmarshal(m, &taskRun)
								if err == nil {
									fmt.Printf("  Task Id:               %v\n", taskRun.TaskId)
									fmt.Printf("  Run Id:                %v\n", taskRun.RunId)
								}
								tcrq := queue.TaskClaimRequest{
									MessageId:   j.MessageId,
									Receipt:     j.PopReceipt,
									Token:       taskRun.TaskId, // ??? <- already in the url route, also needed in payload?
									WorkerGroup: "Germany",
									WorkerId:    "MysteryWorkerX",
								}
								tcrsp, resp := Queue.ClaimTask(taskRun.TaskId, fmt.Sprintf("%d", taskRun.RunId), &tcrq)
								fmt.Println("-----------")
								fmt.Printf("  Status Code:           %v\n", resp.StatusCode)
								responseBody, err := ioutil.ReadAll(resp.Body)
								if err != nil {
									panic(err)
								}
								fmt.Printf("  Response:              %v\n", string(responseBody))
								requestBody, err := ioutil.ReadAll(resp.Request.Body)
								if err != nil {
									panic(err)
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
							}
							fmt.Printf("==========================================")
						}
						break
					}
				}
			}
			log.Printf("    %v\n", err)
			log.Printf("    Sleeping %v seconds...\n", 1<<attempts)
			time.Sleep(time.Second << attempts)
		}
		if messageCount := len(queueMessagesList.QueueMessages); messageCount == 0 {
			fmt.Println("  0 queue messages returned, trying next url in the list...")
		} else {
			fmt.Printf("  %v Message(s) returned in queue, exiting loop...\n", messageCount)
			break
		}
	}
}
