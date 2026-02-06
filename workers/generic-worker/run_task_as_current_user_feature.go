//go:build multiuser

package main

import (
	"github.com/taskcluster/taskcluster/v96/internal/scopes"
)

type RunTaskAsCurrentUserFeature struct {
}

func (feature *RunTaskAsCurrentUserFeature) Name() string {
	return "Run Task As Current User"
}

func (feature *RunTaskAsCurrentUserFeature) Initialise() error {
	return nil
}

func (feature *RunTaskAsCurrentUserFeature) IsEnabled() bool {
	// Disabled when capacity > 1: running as the worker user would bypass
	// per-task user isolation, giving the task full access to other tasks'
	// directories, proxy ports, and credentials.
	return config.EnableRunTaskAsCurrentUser && config.Capacity == 1
}

func (feature *RunTaskAsCurrentUserFeature) IsRequested(task *TaskRun) bool {
	return task.Payload.Features.RunTaskAsCurrentUser
}

type RunTaskAsCurrentUserTask struct {
	task *TaskRun
}

func (feature *RunTaskAsCurrentUserFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &RunTaskAsCurrentUserTask{
		task: task,
	}
}

func (r *RunTaskAsCurrentUserTask) ReservedArtifacts() []string {
	return []string{}
}

func (r *RunTaskAsCurrentUserTask) RequiredScopes() scopes.Required {
	return scopes.Required{{
		"generic-worker:run-task-as-current-user:" + config.ProvisionerID + "/" + config.WorkerType,
	}}
}

func (r *RunTaskAsCurrentUserTask) Start() *CommandExecutionError {
	r.resetPlatformData()
	return r.platformSpecificActions()
}

func (r *RunTaskAsCurrentUserTask) Stop(err *ExecutionErrors) {
}
