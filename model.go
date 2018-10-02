package main

import (
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/taskcluster/generic-worker/process"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
)

type (

	// TaskId and RunId are taken from the json encoding of
	TaskRun struct {
		TaskID              string                         `json:"taskId"`
		RunID               uint                           `json:"runId"`
		TaskClaimResponse   tcqueue.TaskClaimResponse      `json:"-"`
		TaskReclaimResponse tcqueue.TaskReclaimResponse    `json:"-"`
		Definition          tcqueue.TaskDefinitionResponse `json:"-"`
		Payload             GenericWorkerPayload           `json:"-"`
		// Artifacts is a map from artifact name to artifact
		Artifacts map[string]TaskArtifact `json:"-"`
		Status    TaskStatus              `json:"-"`
		Commands  []*process.Command      `json:"-"`
		// not exported
		logMux         sync.RWMutex
		logWriter      io.Writer
		queueMux       sync.RWMutex
		Queue          *tcqueue.Queue     `json:"-"`
		StatusManager  *TaskStatusManager `json:"-"`
		LocalClaimTime time.Time          `json:"-"`
		// PlatformData contains platform-specific data related to the
		// execution environment, such as access tokens on Windows
		PlatformData *PlatformData `json:"-"`
		// This is a map of artifact names to internal feature names for
		// reserving artifact names that are uploaded implicitly rather than
		// being listed in the task.payload.artifacts section, such as logs,
		// chain of trust signatures, etc. Including artifact names as keys in
		// this map means that if they also get included as a payload artifact,
		// the feature artifact will take precedence, and the payload artifact
		// will be skipped. The internal feature name is just used for logging
		// the feature name that caused the upload to be skipped, which may
		// be useful for the user. Normally this map would get appended to by
		// features when they are started.
		featureArtifacts map[string]string
	}

	S3ArtifactResponse struct {
		StorageType string    `json:"storageType"`
		PutURL      string    `json:"putUrl"`
		Expires     time.Time `json:"expires"`
		ContentType string    `json:"contentType"`
	}

	TaskStatus       string
	TaskUpdateReason string
)

func (task *TaskRun) String() string {
	response := fmt.Sprintf("Task Id:                 %v\n", task.TaskID)
	response += fmt.Sprintf("Run Id:                  %v\n", task.RunID)
	response += fmt.Sprintf("Run Id (Task Claim):     %v\n", task.TaskClaimResponse.RunID)
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
