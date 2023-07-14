//go:build darwin

package main

import "fmt"

func (task *TaskRun) convertDockerWorkerPayload() *CommandExecutionError {
	return executionError(malformedPayload, errored, fmt.Errorf("Docker Worker payload conversion using d2g is not supported on macOS"))
}
