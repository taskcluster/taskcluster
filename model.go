package main

import (
	"encoding/xml"
	"fmt"
	"github.com/taskcluster/taskcluster-client-go/queue"
	"time"
)

// Used for modelling the xml we get back from Azure
type QueueMessagesList struct {
	XMLName       xml.Name       `xml:"QueueMessagesList"`
	QueueMessages []QueueMessage `xml:"QueueMessage"`
}

// Used for modelling the xml we get back from Azure
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

// Used for modelling the json encoding of QueueMessage.MessageId that we get
// back from Azure
type TaskRun struct {
	TaskId                string                  `json:"taskId"`
	RunId                 uint                    `json:"runId"`
	QueueMessage          QueueMessage            `json:"-"`
	SignedURLPair         SignedURLPair           `json:"-"`
	TaskClaimResponse     queue.TaskClaimResponse `json:"-"`
	ClaimResponseBody     string                  `json:"-"`
	ClaimHTTPResponseCode int                     `json:"-"`
	reclaimTimer          *time.Timer             `json:"-"`
}

// Custom time format to enable unmarshalling of azure xml directly into go
// object with native go time.Time implementation under-the-hood
type azureTimeFormat struct {
	time.Time
}

// Custom Unmarshaller in order to interpret time formats in the azure expected
// format
func (c *azureTimeFormat) UnmarshalXML(d *xml.Decoder, start xml.StartElement) error {
	const shortForm = "Mon, 2 Jan 2006 15:04:05 MST" // date format of azure xml responses
	var v string
	d.DecodeElement(&v, &start)
	parse, err := time.Parse(shortForm, v)
	*c = azureTimeFormat{parse}
	return err
}

type SignedURLPair struct {
	SignedDeleteUrl string `json:"signedDeleteUrl"`
	SignedPollUrl   string `json:"signedPollUrl"`
}

func (task *TaskRun) String() string {
	response := fmt.Sprintln("HTTP Claim response:")
	response += fmt.Sprintln("")
	response += fmt.Sprintln(task.ClaimResponseBody)
	response += fmt.Sprintln("")
	response += fmt.Sprintf("Task Id:               %v\n", task.TaskId)
	response += fmt.Sprintf("Run Id:                %v\n", task.RunId)
	response += fmt.Sprintf("Run Id (Task Claim):   %v\n", task.TaskClaimResponse.RunId)
	response += fmt.Sprintf("Status Code:           %v\n", task.ClaimHTTPResponseCode)
	response += fmt.Sprintf("Message Id:            %v\n", task.QueueMessage.MessageId)
	response += fmt.Sprintf("Insertion Time:        %v\n", task.QueueMessage.InsertionTime)
	response += fmt.Sprintf("Expiration Time:       %v\n", task.QueueMessage.ExpirationTime)
	response += fmt.Sprintf("Dequeue Count:         %v\n", task.QueueMessage.DequeueCount)
	response += fmt.Sprintf("Pop Receipt:           %v\n", task.QueueMessage.PopReceipt)
	response += fmt.Sprintf("Time Next Visible:     %v\n", task.QueueMessage.TimeNextVisible)
	response += fmt.Sprintf("Message Text:          %v\n", task.QueueMessage.MessageText)
	response += fmt.Sprintf("XML Name:              %v\n", task.QueueMessage.XMLName)
	for i, run := range task.TaskClaimResponse.Status.Runs {
		response += fmt.Sprintf("Run %v:\n", i)
		response += fmt.Sprintf("  Reason Created:      %v\n", run.ReasonCreated)
		response += fmt.Sprintf("  Reason Resolved:     %v\n", run.ReasonResolved)
		response += fmt.Sprintf("  Resolved:            %v\n", run.Resolved)
		response += fmt.Sprintf("  Run Id:              %v\n", run.RunId)
		response += fmt.Sprintf("  Scheduled:           %v\n", run.Scheduled)
		response += fmt.Sprintf("  Started:             %v\n", run.Started)
		response += fmt.Sprintf("  State:               %v\n", run.State)
		response += fmt.Sprintf("  Taken Until:         %v\n", run.TakenUntil)
		response += fmt.Sprintf("  Worker Group:        %v\n", run.WorkerGroup)
		response += fmt.Sprintf("  Worker Id:           %v\n", run.WorkerId)
	}
	response += fmt.Sprintf("Status Deadline:       %v\n", task.TaskClaimResponse.Status.Deadline)
	response += fmt.Sprintf("Status Provisioner Id: %v\n", task.TaskClaimResponse.Status.ProvisionerId)
	response += fmt.Sprintf("Status Retries Left:   %v\n", task.TaskClaimResponse.Status.RetriesLeft)
	response += fmt.Sprintf("Status Scheduler Id:   %v\n", task.TaskClaimResponse.Status.SchedulerId)
	response += fmt.Sprintf("Status State:          %v\n", task.TaskClaimResponse.Status.State)
	response += fmt.Sprintf("Status Task Group Id:  %v\n", task.TaskClaimResponse.Status.TaskGroupId)
	response += fmt.Sprintf("Status Task Id:        %v\n", task.TaskClaimResponse.Status.TaskId)
	response += fmt.Sprintf("Status Worker Type:    %v\n", task.TaskClaimResponse.Status.WorkerType)
	response += fmt.Sprintf("Taken Until:           %v\n", task.TaskClaimResponse.TakenUntil)
	response += fmt.Sprintf("Worker Group:          %v\n", task.TaskClaimResponse.WorkerGroup)
	response += fmt.Sprintf("Worker Id:             %v\n", task.TaskClaimResponse.WorkerId)
	response += fmt.Sprintf("Signed Poll URL:       %v\n", task.SignedURLPair.SignedPollUrl)
	response += fmt.Sprintf("Signed Delete URL:     %v\n", task.SignedURLPair.SignedDeleteUrl)
	response += fmt.Sprintf("==========================================\n")
	return response
}
