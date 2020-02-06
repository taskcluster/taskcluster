package main

import (
	"fmt"

	"github.com/taskcluster/generic-worker/win32"
	"github.com/taskcluster/taskcluster-base-go/scopes"
)

type RunAsAdministratorFeature struct {
}

func (feature *RunAsAdministratorFeature) Name() string {
	return "Run As Administrator"
}

func (feature *RunAsAdministratorFeature) Initialise() error {
	return nil
}

func (feature *RunAsAdministratorFeature) PersistState() error {
	return nil
}

func (feature *RunAsAdministratorFeature) IsEnabled(task *TaskRun) bool {
	return task.Payload.Features.RunAsAdministrator
}

type RunAsAdministratorTask struct {
	task *TaskRun
}

func (l *RunAsAdministratorTask) ReservedArtifacts() []string {
	return []string{}
}

func (feature *RunAsAdministratorFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &RunAsAdministratorTask{
		task: task,
	}
}

func (l *RunAsAdministratorTask) RequiredScopes() scopes.Required {
	return scopes.Required{{
		"generic-worker:run-as-administrator:" + config.ProvisionerID + "/" + config.WorkerType,
	}}
}

func (l *RunAsAdministratorTask) Start() *CommandExecutionError {
	if config.RunTasksAsCurrentUser {
		// already running as LocalSystem with UAC elevation
		return nil
	}
	if !UACEnabled() {
		return MalformedPayloadError(fmt.Errorf(`UAC is disabled on this worker type (%v/%v) - therefore runAsAdministrator property not allowed in task payload`, config.ProvisionerID, config.WorkerType))
	}
	for _, c := range l.task.Commands {
		adminToken, err := win32.GetLinkedToken(c.Cmd.SysProcAttr.Token)
		if err != nil {
			return MalformedPayloadError(fmt.Errorf(`Could not obtain UAC elevated auth token; you probably need to add group "Administrators" to task.payload.osGroups: %v`, err))
		}
		c.SysProcAttr.Token = adminToken
	}
	adminToken, err := taskContext.pd.LoginInfo.ElevatedAccessToken()
	if err != nil {
		return MalformedPayloadError(fmt.Errorf(`Could not obtain UAC elevated auth token; you probably need to add group "Administrators" to task.payload.osGroups: %v`, err))
	}
	taskContext.pd.CommandAccessToken = adminToken
	return nil
}

func (l *RunAsAdministratorTask) Stop(err *ExecutionErrors) {
}
