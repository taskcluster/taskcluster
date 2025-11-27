package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v94/internal/scopes"
	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/graceful"
)

type (
	AbortFeature struct {
	}

	AbortTaskFeature struct {
		task                            *TaskRun
		stopHandlingGracefulTermination func()
	}
)

func (af *AbortFeature) Name() string {
	return "Abort"
}

func (af *AbortFeature) Initialise() (err error) {
	return nil
}

func (af *AbortFeature) IsEnabled() bool {
	return true
}

func (af *AbortFeature) IsRequested(task *TaskRun) bool {
	return true
}

func (af *AbortFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &AbortTaskFeature{
		task: task,
	}
}

func (atf *AbortTaskFeature) ReservedArtifacts() []string {
	return []string{}
}

func (atf *AbortTaskFeature) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (atf *AbortTaskFeature) Start() *CommandExecutionError {
	// Terminating the Worker Early
	// ----------------------------
	// If the worker finds itself having to terminate early, for example a spot
	// nodes that detects pending termination. Or a physical machine ordered to
	// be provisioned for another purpose, the worker should report exception
	// with the reason `worker-shutdown`. Upon such report the queue will
	// resolve the run as exception and create a new run, if the task has
	// additional retries left.
	atf.stopHandlingGracefulTermination = graceful.OnTerminationRequest(func(finishTasks bool) {
		if !finishTasks {
			_ = atf.task.StatusManager.Abort(
				&CommandExecutionError{
					Cause:      fmt.Errorf("graceful termination requested, without time to finish tasks"),
					Reason:     workerShutdown,
					TaskStatus: aborted,
				},
			)
		}
	})
	return nil
}

func (atf *AbortTaskFeature) Stop(err *ExecutionErrors) {
	atf.stopHandlingGracefulTermination()
}
