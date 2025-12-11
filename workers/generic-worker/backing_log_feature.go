package main

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/taskcluster/taskcluster/v95/internal/scopes"
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
	absLogFile := filepath.Join(taskContext.TaskDir, logPath)
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
	if bltf.task.Payload.Features.BackingLog {
		err.add(bltf.task.uploadLog(bltf.task.Payload.Logs.Backing, filepath.Join(taskContext.TaskDir, logPath)))
	}
	if config.CleanUpTaskDirs {
		_ = os.Remove(filepath.Join(taskContext.TaskDir, logPath))
	}
}
