package main

import "github.com/taskcluster/taskcluster-base-go/scopes"

type (
	Feature interface {
		Initialise() error
		PersistState() error
		IsEnabled(task *TaskRun) bool
		NewTaskFeature(task *TaskRun) TaskFeature
		Name() string
	}

	TaskFeature interface {
		RequiredScopes() scopes.Required
		ReservedArtifacts() []string
		Start() *CommandExecutionError
		Stop(err *ExecutionErrors)
	}
)
