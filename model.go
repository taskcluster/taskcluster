package main

import (
	"encoding/xml"
	"fmt"
	"io"
	"net"
	"sync"
	"time"

	"github.com/taskcluster/taskcluster-client-go/queue"
)

type ExecCommand interface {
	Start() error
	Wait() error
}

type (
	// Generic Worker config
	Config struct {
		AccessToken                    string                 `json:"accessToken"`
		ClientID                       string                 `json:"clientId"`
		LiveLogCertificate             string                 `json:"livelogCertificate"`
		LiveLogExecutable              string                 `json:"livelogExecutable"`
		LiveLogKey                     string                 `json:"livelogKey"`
		LiveLogSecret                  string                 `json:"livelogSecret"`
		Certificate                    string                 `json:"certificate"`
		ProvisionerID                  string                 `json:"provisionerId"`
		RefreshUrlsPrematurelySecs     int                    `json:"refreshURLsPrematurelySecs"`
		PublicIP                       net.IP                 `json:"publicIP"`
		PrivateIP                      net.IP                 `json:"privateIP"`
		Subdomain                      string                 `json:"subdomain"`
		WorkerGroup                    string                 `json:"workerGroup"`
		WorkerID                       string                 `json:"workerId"`
		InstanceID                     string                 `json:"instanceId"`
		InstanceType                   string                 `json:"instanceType"`
		Region                         string                 `json:"region"`
		WorkerType                     string                 `json:"workerType"`
		UsersDir                       string                 `json:"usersDir"`
		CachesDir                      string                 `json:"cachesDir"`
		DownloadsDir                   string                 `json:"downloadsDir"`
		CleanUpTaskDirs                bool                   `json:"cleanUpTaskDirs"`
		IdleShutdownTimeoutSecs        int                    `json:"idleShutdownTimeoutSecs"`
		WorkerTypeMetadata             map[string]interface{} `json:"workerTypeMetadata"`
		SigningKeyLocation             string                 `json:"signingKeyLocation"`
		RunTasksAsCurrentUser          bool                   `json:"runTasksAsCurrentUser"`
		RequiredDiskSpaceMegabytes     int                    `json:"requiredDiskSpaceMegabytes"`
		ShutdownMachineOnInternalError bool                   `json:"shutdownMachineOnInternalError"`
		NumberOfTasksToRun             uint                   `json:"numberOfTasksToRun"`
	}

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

	// TaskId and RunId are taken from the json encoding of
	// QueueMessage.MessageId that we get back from Azure
	TaskRun struct {
		TaskID              string                       `json:"taskId"`
		RunID               uint                         `json:"runId"`
		QueueMessage        QueueMessage                 `json:"-"`
		SignedURLPair       SignedURLPair                `json:"-"`
		TaskClaimRequest    queue.TaskClaimRequest       `json:"-"`
		TaskClaimResponse   queue.TaskClaimResponse      `json:"-"`
		TaskReclaimResponse queue.TaskReclaimResponse    `json:"-"`
		Definition          queue.TaskDefinitionResponse `json:"-"`
		Payload             GenericWorkerPayload         `json:"-"`
		Artifacts           []Artifact                   `json:"-"`
		Status              TaskStatus                   `json:"-"`
		Commands            []Command                    `json:"-"`
		// not exported
		reclaimTimer *time.Timer
		logWriter    io.Writer
		Queue        *queue.Queue `json:"-"`
	}

	// Regardless of platform, we will have to call out to system commands to run tasks,
	// and each command execution should write to a file.
	Command struct {
		sync.RWMutex
		osCommand ExecCommand
	}

	// Custom time format to enable unmarshalling of azure xml directly into go
	// object with native go time.Time implementation under-the-hood
	azureTimeFormat struct {
		time.Time
	}

	SignedURLPair struct {
		SignedDeleteURL string `json:"signedDeleteUrl"`
		SignedPollURL   string `json:"signedPollUrl"`
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

	TaskStatus       string
	TaskUpdateReason string
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
	response := fmt.Sprintf("Task Id:                 %v\n", task.TaskID)
	response += fmt.Sprintf("Run Id:                  %v\n", task.RunID)
	response += fmt.Sprintf("Run Id (Task Claim):     %v\n", task.TaskClaimResponse.RunID)
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
		response += fmt.Sprintf("  Run Id:                %v\n", run.RunID)
		response += fmt.Sprintf("  Scheduled:             %v\n", run.Scheduled)
		response += fmt.Sprintf("  Started:               %v\n", run.Started)
		response += fmt.Sprintf("  State:                 %v\n", string(run.State))
		response += fmt.Sprintf("  Taken Until:           %v\n", run.TakenUntil)
		response += fmt.Sprintf("  Worker Group:          %v\n", run.WorkerGroup)
		response += fmt.Sprintf("  Worker Id:             %v\n", run.WorkerID)
	}
	response += fmt.Sprintf("==========================================\n")
	response += fmt.Sprintf("Status Deadline:         %v\n", task.TaskClaimResponse.Status.Deadline)
	response += fmt.Sprintf("Status Provisioner Id:   %v\n", task.TaskClaimResponse.Status.ProvisionerID)
	response += fmt.Sprintf("Status Retries Left:     %v\n", task.TaskClaimResponse.Status.RetriesLeft)
	response += fmt.Sprintf("Status Scheduler Id:     %v\n", task.TaskClaimResponse.Status.SchedulerID)
	response += fmt.Sprintf("Status State:            %v\n", string(task.TaskClaimResponse.Status.State))
	response += fmt.Sprintf("Status Task Group Id:    %v\n", task.TaskClaimResponse.Status.TaskGroupID)
	response += fmt.Sprintf("Status Task Id:          %v\n", task.TaskClaimResponse.Status.TaskID)
	response += fmt.Sprintf("Status Worker Type:      %v\n", task.TaskClaimResponse.Status.WorkerType)
	response += fmt.Sprintf("Taken Until:             %v\n", task.TaskClaimResponse.TakenUntil)
	response += fmt.Sprintf("Worker Group:            %v\n", task.TaskClaimResponse.WorkerGroup)
	response += fmt.Sprintf("Worker Id:               %v\n", task.TaskClaimResponse.WorkerID)
	response += fmt.Sprintf("==========================================\n")
	response += fmt.Sprintf("Signed Poll URL:         %v\n", task.SignedURLPair.SignedPollURL)
	response += fmt.Sprintf("Signed Delete URL:       %v\n", task.SignedURLPair.SignedDeleteURL)
	response += fmt.Sprintf("==========================================\n")
	response += fmt.Sprintf("Created:                 %v\n", task.Definition.Created)
	response += fmt.Sprintf("Deadline:                %v\n", task.Definition.Deadline)
	response += fmt.Sprintf("Expires:                 %v\n", task.Definition.Expires)
	response += fmt.Sprintf("Extra:                   %s\n", task.Definition.Extra)
	response += fmt.Sprintf("Metadata:                %v\n", task.Definition.Metadata)
	response += fmt.Sprintf("Payload:                 %s\n", task.Definition.Payload)
	response += fmt.Sprintf("Provisioner Id:          %v\n", task.Definition.ProvisionerID)
	response += fmt.Sprintf("Retries:                 %v\n", task.Definition.Retries)
	response += fmt.Sprintf("Routes:                  %#v\n", task.Definition.Routes)
	response += fmt.Sprintf("SchedulerId:             %v\n", task.Definition.SchedulerID)
	response += fmt.Sprintf("Scopes:                  %#v\n", task.Definition.Scopes)
	response += fmt.Sprintf("Tags:                    %s\n", task.Definition.Tags)
	response += fmt.Sprintf("Task Group Id:           %v\n", task.Definition.TaskGroupID)
	response += fmt.Sprintf("Worker Type:             %v\n", task.Definition.WorkerType)
	response += fmt.Sprintf("==========================================\n")
	response += fmt.Sprintf("Artifacts:               %v\n", task.Payload.Artifacts)
	response += fmt.Sprintf("Command:                 %#v\n", task.Payload.Command)
	response += fmt.Sprintf("Env:                     %#v\n", task.Payload.Env)
	response += fmt.Sprintf("Max Run Time:            %v\n", task.Payload.MaxRunTime)
	response += fmt.Sprintf("==========================================\n")
	return response
}
