//go:build multiuser

package main

import (
	"github.com/taskcluster/taskcluster/v80/internal/scopes"
)

type RunTaskAsCurrentUserFeature struct {
}

func (feature *RunTaskAsCurrentUserFeature) Name() string {
	return "Run Task As Current User"
}

func (feature *RunTaskAsCurrentUserFeature) Initialise() error {
	return nil
}

func (feature *RunTaskAsCurrentUserFeature) PersistState() error {
	return nil
}

func (feature *RunTaskAsCurrentUserFeature) IsEnabled() bool {
	return config.EnableRunTaskAsCurrentUser
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
	r.setTaskUserCredentialsEnvVar()
	r.platformSpecificActions()
	return nil
}

func (r *RunTaskAsCurrentUserTask) Stop(err *ExecutionErrors) {
}

func (r *RunTaskAsCurrentUserTask) setTaskUserCredentialsEnvVar() {
	if r.task.Payload.Env == nil {
		r.task.Payload.Env = make(map[string]string)
	}

	r.task.Payload.Env["TASK_USER_CREDENTIALS"] = ctuPath
}
