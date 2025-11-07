package main

import (
	"log"

	"github.com/taskcluster/taskcluster/v93/internal/scopes"
	"github.com/taskcluster/taskcluster/v93/workers/generic-worker/process"
)

type (
	CommandGeneratorFeature struct {
	}

	CommandGeneratorTaskFeature struct {
		task *TaskRun
	}
)

func (cgf *CommandGeneratorFeature) Name() string {
	return "Command Generator"
}

func (cgf *CommandGeneratorFeature) Initialise() (err error) {
	return nil
}

func (cgf *CommandGeneratorFeature) IsEnabled() bool {
	return true
}

func (cgf *CommandGeneratorFeature) IsRequested(task *TaskRun) bool {
	return true
}

func (cgf *CommandGeneratorFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &CommandGeneratorTaskFeature{
		task: task,
	}
}

func (cgtf *CommandGeneratorTaskFeature) ReservedArtifacts() []string {
	return []string{}
}

func (cgtf *CommandGeneratorTaskFeature) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (cgtf *CommandGeneratorTaskFeature) Start() *CommandExecutionError {
	task := cgtf.task
	task.Commands = make([]*process.Command, len(task.Payload.Command))
	// generate commands, in case features want to modify them
	for i := range task.Payload.Command {
		log.Printf("Generating command %v", i)
		if err := task.generateCommand(i); err != nil {
			return executionError(internalError, errored, err)
		}
	}
	return nil
}

func (cgtf *CommandGeneratorTaskFeature) Stop(err *ExecutionErrors) {
}
