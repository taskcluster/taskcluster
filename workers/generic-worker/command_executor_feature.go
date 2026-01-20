package main

import (
	"github.com/taskcluster/taskcluster/v96/internal/scopes"
)

type (
	CommandExecutorFeature struct {
	}

	CommandExecutorTaskFeature struct {
		task *TaskRun
	}
)

func (cef *CommandExecutorFeature) Name() string {
	return "Command Executor"
}

func (cef *CommandExecutorFeature) Initialise() (err error) {
	return nil
}

func (cef *CommandExecutorFeature) IsEnabled() bool {
	return true
}

func (cef *CommandExecutorFeature) IsRequested(task *TaskRun) bool {
	return true
}

func (cef *CommandExecutorFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &CommandExecutorTaskFeature{
		task: task,
	}
}

func (cetf *CommandExecutorTaskFeature) ReservedArtifacts() []string {
	return []string{}
}

func (cetf *CommandExecutorTaskFeature) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (cetf *CommandExecutorTaskFeature) Start() *CommandExecutionError {
	for i := range cetf.task.Payload.Command {
		if err := cetf.task.ExecuteCommand(i); err != nil {
			return err
		}
	}
	return nil
}

func (cetf *CommandExecutorTaskFeature) Stop(err *ExecutionErrors) {
}
