package main

import "github.com/taskcluster/taskcluster/v83/internal/scopes"

type DelegateFeature struct {
}

func (feature *DelegateFeature) Name() string {
	return "Run Task As Current User"
}

func (feature *DelegateFeature) Initialise() error {
	return nil
}

func (feature *DelegateFeature) IsEnabled() bool {
	return true
}

func (feature *DelegateFeature) IsRequested(task *TaskRun) bool {
	return true
}

type DelegateTask struct {
	task *TaskRun
}

func (feature *DelegateFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &DelegateTask{
		task: task,
	}
}

func (r *DelegateTask) ReservedArtifacts() []string {
	return []string{}
}

func (r *DelegateTask) RequiredScopes() scopes.Required {
	return scopes.Required{{}}
}

func (r *DelegateTask) Start() *CommandExecutionError {
	return nil
}

func (r *DelegateTask) Stop(err *ExecutionErrors) {
}
