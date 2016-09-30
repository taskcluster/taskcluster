package main

import "github.com/taskcluster/taskcluster-base-go/scopes"

type (
	Feature interface {
		Initialise() error
		IsEnabled(fl EnabledFeatures) bool
		NewTaskFeature(task *TaskRun) TaskFeature
		Name() string
	}

	TaskFeature interface {
		RequiredScopes() scopes.Required
		Start() *CommandExecutionError
		Stop() *CommandExecutionError
	}

	EnabledFeatures struct {
		// A certificate should be generated which will include information for downstream tasks to build a level of trust for the artifacts produced by the task and the environment it ran in.
		ChainOfTrust bool `json:"chainOfTrust,omitempty"`
	}
)
