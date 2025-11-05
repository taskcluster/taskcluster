package main

import (
	"github.com/taskcluster/taskcluster/v92/internal/scopes"
)

// one instance overall - represents feature
type OSGroupsFeature struct {
}

func (feature *OSGroupsFeature) Name() string {
	return "OS Groups"
}

func (feature *OSGroupsFeature) Initialise() error {
	return nil
}

func (feature *OSGroupsFeature) IsEnabled() bool {
	return config.EnableOSGroups
}

func (feature *OSGroupsFeature) IsRequested(task *TaskRun) bool {
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
	requiredScopes := make([]string, len(osGroups.Task.Payload.OSGroups))
	for i, osGroup := range osGroups.Task.Payload.OSGroups {
		requiredScopes[i] = "generic-worker:os-group:" + config.ProvisionerID + "/" + config.WorkerType + "/" + osGroup
	}
	return scopes.Required{requiredScopes}
}
