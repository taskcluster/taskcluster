package main

import (
	"encoding/json"
	"os"

	"github.com/taskcluster/taskcluster/v97/internal/scopes"
	"github.com/taskcluster/taskcluster/v97/workers/generic-worker/fileutil"
)

type (
	BackingLogFeature struct {
	}

	BackingLogTaskFeature struct {
		task      *TaskRun
		logHandle *os.File
	}
)

func (blf *BackingLogFeature) Name() string {
	return "Backing Log"
}

func (blf *BackingLogFeature) Initialise() (err error) {
	return nil
}

func (blf *BackingLogFeature) IsEnabled() bool {
	return true
}

func (blf *BackingLogFeature) IsRequested(task *TaskRun) bool {
	return true
}

func (blf *BackingLogFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &BackingLogTaskFeature{
		task: task,
	}
}

func (bltf *BackingLogTaskFeature) ReservedArtifacts() []string {
	return []string{}
}

func (bltf *BackingLogTaskFeature) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (bltf *BackingLogTaskFeature) Start() *CommandExecutionError {
	absLogFile := fileutil.AbsFrom(bltf.task.TaskDir(), logPath)
	logFileHandle, err := os.Create(absLogFile)
	if err != nil {
		return executionError(internalError, errored, err)
	}
	bltf.logHandle = logFileHandle
	bltf.task.logMux.Lock()
	bltf.task.logWriter = logFileHandle
	bltf.task.logMux.Unlock()
	jsonBytes, err := json.MarshalIndent(config.WorkerTypeMetadata, "  ", "  ")
	if err != nil {
		return executionError(internalError, errored, err)
	}
	bltf.task.Infof("Worker Type (%v/%v) settings:", config.ProvisionerID, config.WorkerType)
	bltf.task.Info("  " + string(jsonBytes))
	bltf.task.Info("Task ID: " + bltf.task.TaskID)
	bltf.task.Info("=== Task Starting ===")
	return nil
}

func (bltf *BackingLogTaskFeature) Stop(err *ExecutionErrors) {
	// log first error that occurred
	if err.Occurred() {
		bltf.task.Error(err.Error())
	}
	bltf.task.closeLog(bltf.logHandle)
	taskDir := bltf.task.TaskDir()
	if bltf.task.Payload.Features.BackingLog {
		err.add(bltf.task.uploadLog(bltf.task.Payload.Logs.Backing, fileutil.AbsFrom(taskDir, logPath)))
	}
	if config.CleanUpTaskDirs {
		_ = os.Remove(fileutil.AbsFrom(taskDir, logPath))
	}
}
