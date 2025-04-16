package main

import (
	"github.com/taskcluster/taskcluster/v83/internal/scopes"
)

type (
	CommandsFeature struct {
	}

	CommandsTaskFeature struct {
		task *TaskRun
	}
)

func (cf *CommandsFeature) Name() string {
	return "Command Executor"
}

func (cf *CommandsFeature) Initialise() (err error) {
	return nil
}

func (cf *CommandsFeature) IsEnabled() bool {
	return true
}

func (cf *CommandsFeature) IsRequested(task *TaskRun) bool {
	return true
}

func (cf *CommandsFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &CommandsTaskFeature{
		task: task,
	}
}

func (ctf *CommandsTaskFeature) ReservedArtifacts() []string {
	return []string{}
}

func (ctf *CommandsTaskFeature) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (ctf *CommandsTaskFeature) Start() *CommandExecutionError {
	for i := range ctf.task.Payload.Command {
		if err := ctf.task.ExecuteCommand(i); err != nil {
			return err
		}
	}
	return nil
}

func (ctf *CommandsTaskFeature) Stop(err *ExecutionErrors) {
}
