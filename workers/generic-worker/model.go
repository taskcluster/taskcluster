package main

import (
	"fmt"
	"io"
	"strings"
	"sync"
	"time"

	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v96/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v96/tools/d2g"
	"github.com/taskcluster/taskcluster/v96/tools/d2g/dockerworker"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/artifacts"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
)

type (
	TaskRun struct {
		TaskID              string                         `json:"taskId"`
		RunID               uint                           `json:"runId"`
		TaskGroupID         string                         `json:"taskGroupId"`
		TaskClaimResponse   tcqueue.TaskClaimResponse      `json:"-"`
		TaskReclaimResponse tcqueue.TaskReclaimResponse    `json:"-"`
		Definition          tcqueue.TaskDefinitionResponse `json:"-"`
		Payload             GenericWorkerPayload           `json:"-"`
		// Artifacts is a map from artifact name to artifact
		Artifacts    map[string]artifacts.TaskArtifact `json:"-"`
		artifactsMux sync.RWMutex
		Status       TaskStatus         `json:"-"`
		Commands     []*process.Command `json:"-"`
		// not exported
		logMux         sync.RWMutex
		logWriter      io.Writer
		pd             *process.PlatformData
		queueMux       sync.RWMutex
		result         *process.Result
		Queue          tc.Queue           `json:"-"`
		StatusManager  *TaskStatusManager `json:"-"`
		LocalClaimTime time.Time          `json:"-"`
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
		featureArtifacts    map[string]string
		D2GInfo             *d2g.ConversionInfo               `json:"-"`
		DockerWorkerPayload *dockerworker.DockerWorkerPayload `json:"-"`
		// Context holds per-task context including task directory and user.
		// This replaces the global taskContext for concurrent task execution.
		Context *TaskContext `json:"-"`
		// AllocatedPorts holds the ports allocated to this task by PortManager.
		// Indexed by PortIndex* constants.
		AllocatedPorts []uint16 `json:"-"`
	}

	TaskStatus       string
	TaskUpdateReason string
)

// GetContext returns the task's context.
// Every task must have a Context set; this method panics if Context is nil.
func (task *TaskRun) GetContext() *TaskContext {
	if task.Context == nil {
		panic("task.Context is nil - every task must have a context assigned")
	}
	return task.Context
}

// TaskDir returns the task's working directory.
func (task *TaskRun) TaskDir() string {
	return task.GetContext().TaskDir
}

// LiveLogPorts returns the GET and PUT ports for livelog.
// Returns (getPort, putPort, ok) where ok is false if ports weren't allocated.
func (task *TaskRun) LiveLogPorts() (getPort, putPort uint16, ok bool) {
	if len(task.AllocatedPorts) < 2 {
		return 0, 0, false
	}
	return task.AllocatedPorts[PortIndexLiveLogGET], task.AllocatedPorts[PortIndexLiveLogPUT], true
}

// InteractivePort returns the interactive shell port.
func (task *TaskRun) InteractivePort() (uint16, bool) {
	if len(task.AllocatedPorts) <= PortIndexInteractive {
		return 0, false
	}
	return task.AllocatedPorts[PortIndexInteractive], true
}

// TaskclusterProxyPort returns the taskcluster-proxy port.
func (task *TaskRun) TaskclusterProxyPort() (uint16, bool) {
	if len(task.AllocatedPorts) <= PortIndexTaskclusterProxy {
		return 0, false
	}
	return task.AllocatedPorts[PortIndexTaskclusterProxy], true
}

func (task *TaskRun) String() string {
	response := fmt.Sprintf("Task Id:                 %v\n", task.TaskID)
	response += fmt.Sprintf("Run Id:                  %v\n", task.RunID)
	response += fmt.Sprintf("Run Id (Task Claim):     %v\n", task.TaskClaimResponse.RunID)
	var loopResponse strings.Builder
	for i, run := range task.TaskClaimResponse.Status.Runs {
		fmt.Fprintf(&loopResponse, "Run %v:\n", i)
		fmt.Fprintf(&loopResponse, "  Reason Created:        %v\n", string(run.ReasonCreated))
		fmt.Fprintf(&loopResponse, "  Reason Resolved:       %v\n", string(run.ReasonResolved))
		fmt.Fprintf(&loopResponse, "  Resolved:              %v\n", run.Resolved)
		fmt.Fprintf(&loopResponse, "  Run Id:                %v\n", run.RunID)
		fmt.Fprintf(&loopResponse, "  Scheduled:             %v\n", run.Scheduled)
		fmt.Fprintf(&loopResponse, "  Started:               %v\n", run.Started)
		fmt.Fprintf(&loopResponse, "  State:                 %v\n", string(run.State))
		fmt.Fprintf(&loopResponse, "  Taken Until:           %v\n", run.TakenUntil)
		fmt.Fprintf(&loopResponse, "  Worker Group:          %v\n", run.WorkerGroup)
		fmt.Fprintf(&loopResponse, "  Worker Id:             %v\n", run.WorkerID)
	}
	response += loopResponse.String()
	response += "==========================================\n"
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
	response += "==========================================\n"
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
	response += "==========================================\n"
	response += fmt.Sprintf("Artifacts:               %v\n", task.Payload.Artifacts)
	response += fmt.Sprintf("Command:                 %#v\n", task.Payload.Command)
	response += fmt.Sprintf("Env:                     %#v\n", task.Payload.Env)
	response += fmt.Sprintf("Max Run Time:            %v\n", task.Payload.MaxRunTime)
	response += "==========================================\n"
	return response
}
