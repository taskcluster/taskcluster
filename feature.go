package main

import "github.com/taskcluster/taskcluster-base-go/scopes"

type (
	Feature interface {
		Initialise() error
		Created(task *TaskRun) error
		Killed(task *TaskRun) error
		IsEnabled(fl EnabledFeatures) bool
		RequiredScopes() scopes.Required
	}

	EnabledFeatures struct {
		// A certificate should be generated which will include information for downstream tasks to build a level of trust for the artifacts produced by the task and the environment it ran in.
		GenerateCertificate bool `json:"generateCertificate,omitempty"`
	}
)
