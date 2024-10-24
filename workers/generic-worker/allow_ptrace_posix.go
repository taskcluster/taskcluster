//go:build darwin || linux || freebsd

package main

import (
	"github.com/taskcluster/taskcluster/v73/internal/scopes"
)

type AllowPtraceFeature struct {
}

func (feature *AllowPtraceFeature) Name() string {
	return "Allow Ptrace"
}

func (feature *AllowPtraceFeature) Initialise() error {
	return nil
}

func (feature *AllowPtraceFeature) PersistState() error {
	return nil
}

func (feature *AllowPtraceFeature) IsEnabled(task *TaskRun) bool {
	return config.EnableD2G && task.Payload.Features.AllowPtrace
}

func (feature *AllowPtraceFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &AllowPtraceTask{
		task: task,
	}
}

type AllowPtraceTask struct {
	task *TaskRun
}

func (aptt *AllowPtraceTask) RequiredScopes() scopes.Required {
	// these scopes come from the d2g.Scopes() translation
	// of the Docker Worker scope needed for ptrace usage below:
	//
	// docker-worker:feature:allowPtrace
	return scopes.Required{
		{"generic-worker:feature:allowPtrace"},
	}
}

func (aptt *AllowPtraceTask) ReservedArtifacts() []string {
	return []string{}
}

func (aptt *AllowPtraceTask) Start() *CommandExecutionError {
	return aptt.ensurePlatform()
}

func (aptt *AllowPtraceTask) Stop(err *ExecutionErrors) {
}
