package main

import "github.com/taskcluster/taskcluster-base-go/scopes"

// one instance overall - represents feature
type OSGroupsFeature struct {
}

// one instance per task
type OSGroups struct {
	Task *TaskRun
}

func (feature *OSGroupsFeature) Name() string {
	return "OS Groups"
}

func (feature *OSGroupsFeature) Initialise() error {
	return nil
}

func (feature *OSGroupsFeature) IsEnabled(fl EnabledFeatures) bool {
	// always enabled, since scopes protect usage at a group level
	return true
}

func (feature *OSGroupsFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	osGroups := &OSGroups{
		Task: task,
	}
	return osGroups
}

func (osGroups *OSGroups) RequiredScopes() scopes.Required {
	requiredScopes := make([]string, len(osGroups.Task.Payload.OSGroups), len(osGroups.Task.Payload.OSGroups))
	for i, osGroup := range osGroups.Task.Payload.OSGroups {
		requiredScopes[i] = "generic-worker:os-group:" + osGroup
	}
	return scopes.Required{requiredScopes}
}

func (osGroups *OSGroups) Start() *CommandExecutionError {
	groups := osGroups.Task.Payload.OSGroups
	if config.RunTasksAsCurrentUser {
		osGroups.Task.Logf("Not adding user to groups %v since we are running as current user.", groups)
		return nil
	}
	return MalformedPayloadError(osGroups.Task.addGroupsToUser(groups))
}

func (osGroups *OSGroups) Stop() *CommandExecutionError {
	return nil
}
