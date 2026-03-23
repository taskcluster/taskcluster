package main

import "github.com/taskcluster/taskcluster/v98/internal/scopes"

type (
	Feature interface {
		Initialise() error
		IsEnabled() bool
		IsRequested(task *TaskRun) bool
		NewTaskFeature(task *TaskRun) TaskFeature
		Name() string
	}

	// DisabledReasonProvider is an optional interface that Features can
	// implement to explain why they are disabled (e.g. incompatible with
	// the current capacity setting). When a requested feature is not
	// enabled, the error handler checks for this interface.
	DisabledReasonProvider interface {
		DisabledReason() string
	}

	TaskFeature interface {
		RequiredScopes() scopes.Required
		ReservedArtifacts() []string
		Start() *CommandExecutionError
		Stop(err *ExecutionErrors)
	}
)
