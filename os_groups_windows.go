package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster-base-go/scopes"
)

// one instance overall - represents feature
type OSGroupsFeature struct {
}

// one instance per task
type OSGroups struct {
	Task *TaskRun
	// keep track of which groups we successfully update
	AddedGroups []string
}

func (feature *OSGroupsFeature) Name() string {
	return "OS Groups"
}

func (feature *OSGroupsFeature) Initialise() error {
	return nil
}

func (feature *OSGroupsFeature) PersistState() error {
	return nil
}

func (feature *OSGroupsFeature) IsEnabled(task *TaskRun) bool {
	// always enabled, since scopes protect usage at a group level
	return true
}

func (feature *OSGroupsFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	osGroups := &OSGroups{
		Task: task,
	}
	return osGroups
}

func (osGroups *OSGroups) ReservedArtifacts() []string {
	return []string{}
}

func (osGroups *OSGroups) RequiredScopes() scopes.Required {
	requiredScopes := make([]string, len(osGroups.Task.Payload.OSGroups), len(osGroups.Task.Payload.OSGroups))
	for i, osGroup := range osGroups.Task.Payload.OSGroups {
		requiredScopes[i] = "generic-worker:os-group:" + config.ProvisionerID + "/" + config.WorkerType + "/" + osGroup
	}
	return scopes.Required{requiredScopes}
}

func (osGroups *OSGroups) Start() *CommandExecutionError {
	groups := osGroups.Task.Payload.OSGroups
	if len(groups) == 0 {
		return nil
	}
	if config.RunTasksAsCurrentUser {
		osGroups.Task.Infof("Not adding task user to group(s) %v since we are running as current user.", groups)
		return nil
	}
	updatedGroups, notUpdatedGroups := osGroups.Task.addUserToGroups(groups)
	osGroups.AddedGroups = updatedGroups
	if len(notUpdatedGroups) > 0 {
		return MalformedPayloadError(fmt.Errorf("Could not add task user to os group(s): %v", notUpdatedGroups))
	}
	osGroups.Task.PlatformData.RefreshLoginSession()
	for _, command := range osGroups.Task.Commands {
		command.SysProcAttr.Token = osGroups.Task.PlatformData.LoginInfo.AccessToken()
	}
	return nil
}

func (osGroups *OSGroups) Stop(err *ExecutionErrors) {
	groups := osGroups.AddedGroups
	_, notUpdatedGroups := osGroups.Task.removeUserFromGroups(groups)
	if len(notUpdatedGroups) > 0 {
		err.add(MalformedPayloadError(fmt.Errorf("Could not remove task user from os group(s): %v", notUpdatedGroups)))
	}
}
