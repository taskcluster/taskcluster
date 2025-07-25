package main

import "github.com/taskcluster/taskcluster/v88/internal/scopes"

type (
	Feature interface {
		Initialise() error
		IsEnabled() bool
		IsRequested(task *TaskRun) bool
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
