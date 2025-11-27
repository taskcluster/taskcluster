package main

import (
	"time"

	"github.com/taskcluster/taskcluster/v94/internal/scopes"
)

type (
	TaskTimerFeature struct {
	}

	TaskTimerTaskFeature struct {
		task  *TaskRun
		start time.Time
	}
)

func (ttf *TaskTimerFeature) Name() string {
	return "Task Timer"
}

func (ttf *TaskTimerFeature) Initialise() (err error) {
	return nil
}

func (ttf *TaskTimerFeature) IsEnabled() bool {
	return true
}

func (ttf *TaskTimerFeature) IsRequested(task *TaskRun) bool {
	return true
}

func (ttf *TaskTimerFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &TaskTimerTaskFeature{
		task: task,
	}
}

func (tttf *TaskTimerTaskFeature) ReservedArtifacts() []string {
	return []string{}
}

func (tttf *TaskTimerTaskFeature) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (tttf *TaskTimerTaskFeature) Start() *CommandExecutionError {
	tttf.start = time.Now()
	return nil
}

func (tttf *TaskTimerTaskFeature) Stop(err *ExecutionErrors) {
	finish := time.Now()
	tttf.task.Info("=== Task Finished ===")
	// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
	tttf.task.Info("Task Duration: " + finish.Round(0).Sub(tttf.start).String())
}
