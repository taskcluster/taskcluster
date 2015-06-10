package main

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"time"

	"github.com/taskcluster/taskcluster-client-go/queue"
)

type (
	// Used for modelling the xml we get back from Azure
	QueueMessagesList struct {
		XMLName       xml.Name       `xml:"QueueMessagesList"`
		QueueMessages []QueueMessage `xml:"QueueMessage"`
	}

	// Used for modelling the xml we get back from Azure
	QueueMessage struct {
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
	TaskRun struct {
		TaskId            string                  `json:"taskId"`
		RunId             uint                    `json:"runId"`
		QueueMessage      QueueMessage            `json:"-"`
		SignedURLPair     SignedURLPair           `json:"-"`
		ClaimCallSummary  queue.CallSummary       `json:"-"`
		TaskClaimRequest  queue.TaskClaimRequest  `json:"-"`
		TaskClaimResponse queue.TaskClaimResponse `json:"-"`
		Definition        queue.TaskDefinition1   `json:"-"`
		Payload           GenericWorkerPayload    `json:"-"`
		Artifacts         []Artifact              `json:"-"`
		Status            TaskStatus              `json:"-"`
		// not exported
		reclaimTimer *time.Timer
	}

	Artifact struct {
		LocalPath string
		MimeType  string
		Expires   time.Time
	}

	// Custom time format to enable unmarshalling of azure xml directly into go
	// object with native go time.Time implementation under-the-hood
	azureTimeFormat struct {
		time.Time
	}

	SignedURLPair struct {
		SignedDeleteUrl string `json:"signedDeleteUrl"`
		SignedPollUrl   string `json:"signedPollUrl"`
	}

	S3ArtifactResponse struct {
		StorageType string    `json:"storageType"`
		PutURL      string    `json:"putUrl"`
		Expires     time.Time `json:"expires"`
		ContentType string    `json:"contentType"`
	}

	OSUser struct {
		HomeDir  string
		Name     string
		Password string
	}

	TaskStatus string
)

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

func (task *TaskRun) String() string {
	response := fmt.Sprintf("Task Id:                 %v\n", task.TaskId)
	response += fmt.Sprintf("Run Id:                  %v\n", task.RunId)
	response += fmt.Sprintf("==========================================\n")
	response += fmt.Sprintf("Claim URL:               %v\n", task.ClaimCallSummary.HttpRequest.URL.String())
	response += fmt.Sprintf("Claim Method:            %v\n", task.ClaimCallSummary.HttpRequest.Method)
	response += fmt.Sprintf("Claim Request Headers:\n")
	buffer := new(bytes.Buffer)
	task.ClaimCallSummary.HttpRequest.Header.Write(buffer)
	response += buffer.String()
	response += fmt.Sprintf("Claim Request Body:      %v\n", task.ClaimCallSummary.HttpRequestBody)
	response += fmt.Sprintf("==========================================\n")
	response += fmt.Sprintf("Claim Response Headers:\n")
	buffer = new(bytes.Buffer)
	task.ClaimCallSummary.HttpResponse.Header.Write(buffer)
	response += buffer.String()
	response += fmt.Sprintf("Claim Response Body:     %v\n", task.ClaimCallSummary.HttpResponseBody)
	response += fmt.Sprintf("Claim Response Code:     %v\n", task.ClaimCallSummary.HttpResponse.StatusCode)
	response += fmt.Sprintf("==========================================\n")
	response += fmt.Sprintf("Run Id (Task Claim):     %v\n", task.TaskClaimResponse.RunId)
	response += fmt.Sprintf("Message Id:              %v\n", task.QueueMessage.MessageId)
	response += fmt.Sprintf("Insertion Time:          %v\n", task.QueueMessage.InsertionTime)
	response += fmt.Sprintf("Expiration Time:         %v\n", task.QueueMessage.ExpirationTime)
	response += fmt.Sprintf("Dequeue Count:           %v\n", task.QueueMessage.DequeueCount)
	response += fmt.Sprintf("Pop Receipt:             %v\n", task.QueueMessage.PopReceipt)
	response += fmt.Sprintf("Time Next Visible:       %v\n", task.QueueMessage.TimeNextVisible)
	response += fmt.Sprintf("Message Text:            %v\n", task.QueueMessage.MessageText)
	for i, run := range task.TaskClaimResponse.Status.Runs {
		response += fmt.Sprintf("Run %v:\n", i)
		response += fmt.Sprintf("  Reason Created:        %v\n", string(run.ReasonCreated))
		response += fmt.Sprintf("  Reason Resolved:       %v\n", string(run.ReasonResolved))
		response += fmt.Sprintf("  Resolved:              %v\n", run.Resolved)
		response += fmt.Sprintf("  Run Id:                %v\n", run.RunId)
		response += fmt.Sprintf("  Scheduled:             %v\n", run.Scheduled)
		response += fmt.Sprintf("  Started:               %v\n", run.Started)
		response += fmt.Sprintf("  State:                 %v\n", string(run.State))
		response += fmt.Sprintf("  Taken Until:           %v\n", run.TakenUntil)
		response += fmt.Sprintf("  Worker Group:          %v\n", run.WorkerGroup)
		response += fmt.Sprintf("  Worker Id:             %v\n", run.WorkerId)
	}
	response += fmt.Sprintf("==========================================\n")
	response += fmt.Sprintf("Status Deadline:         %v\n", task.TaskClaimResponse.Status.Deadline)
	response += fmt.Sprintf("Status Provisioner Id:   %v\n", task.TaskClaimResponse.Status.ProvisionerId)
	response += fmt.Sprintf("Status Retries Left:     %v\n", task.TaskClaimResponse.Status.RetriesLeft)
	response += fmt.Sprintf("Status Scheduler Id:     %v\n", task.TaskClaimResponse.Status.SchedulerId)
	response += fmt.Sprintf("Status State:            %v\n", string(task.TaskClaimResponse.Status.State))
	response += fmt.Sprintf("Status Task Group Id:    %v\n", task.TaskClaimResponse.Status.TaskGroupId)
	response += fmt.Sprintf("Status Task Id:          %v\n", task.TaskClaimResponse.Status.TaskId)
	response += fmt.Sprintf("Status Worker Type:      %v\n", task.TaskClaimResponse.Status.WorkerType)
	response += fmt.Sprintf("Taken Until:             %v\n", task.TaskClaimResponse.TakenUntil)
	response += fmt.Sprintf("Worker Group:            %v\n", task.TaskClaimResponse.WorkerGroup)
	response += fmt.Sprintf("Worker Id:               %v\n", task.TaskClaimResponse.WorkerId)
	response += fmt.Sprintf("==========================================\n")
	response += fmt.Sprintf("Signed Poll URL:         %v\n", task.SignedURLPair.SignedPollUrl)
	response += fmt.Sprintf("Signed Delete URL:       %v\n", task.SignedURLPair.SignedDeleteUrl)
	response += fmt.Sprintf("==========================================\n")
	response += fmt.Sprintf("Created:                 %v\n", task.Definition.Created)
	response += fmt.Sprintf("Deadline:                %v\n", task.Definition.Deadline)
	response += fmt.Sprintf("Expires:                 %v\n", task.Definition.Expires)
	response += fmt.Sprintf("Extra:\n")
	for i, j := range task.Definition.Extra {
		response += fmt.Sprintf("  %-40v %s\n", i+":", j)
	}
	response += fmt.Sprintf("Metadata:                %v\n", task.Definition.Metadata)
	response += fmt.Sprintf("Payload:\n")
	for i, j := range task.Definition.Payload {
		response += fmt.Sprintf("  %-40v %s\n", i+":", j)
	}
	response += fmt.Sprintf("Provisioner Id:          %v\n", task.Definition.ProvisionerId)
	response += fmt.Sprintf("Retries:                 %v\n", task.Definition.Retries)
	response += fmt.Sprintf("Routes:                  %#v\n", task.Definition.Routes)
	response += fmt.Sprintf("SchedulerId:             %v\n", task.Definition.SchedulerId)
	response += fmt.Sprintf("Scopes:                  %#v\n", task.Definition.Scopes)
	response += fmt.Sprintf("Tags:\n")
	for i, j := range task.Definition.Tags {
		response += fmt.Sprintf("  %-40v %s\n", i+":", j)
	}
	response += fmt.Sprintf("Task Group Id:           %v\n", task.Definition.TaskGroupId)
	response += fmt.Sprintf("Worker Type:             %v\n", task.Definition.WorkerType)
	response += fmt.Sprintf("==========================================\n")
	response += fmt.Sprintf("Artifacts:               %v\n", task.Payload.Artifacts)
	response += fmt.Sprintf("Command:                 %#v\n", task.Payload.Command)
	response += fmt.Sprintf("Encrypted Env:           %#v\n", task.Payload.EncryptedEnv)
	response += fmt.Sprintf("Env:                     %#v\n", task.Payload.Env)
	response += fmt.Sprintf("Features:                %#v\n", task.Payload.Features)
	response += fmt.Sprintf("Graphs:                  %v\n", task.Payload.Graphs)
	response += fmt.Sprintf("Max Run Time:            %v\n", task.Payload.MaxRunTime)
	response += fmt.Sprintf("==========================================\n")
	return response
}
