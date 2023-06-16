//go:build darwin

package main

import (
	"fmt"
)

func setupVideoDevice(task *TaskRun) *CommandExecutionError {
	return executionError(malformedPayload, errored, fmt.Errorf("Loopback video device is not supported on macOS"))
}

func resetVideoDevice() *CommandExecutionError {
	return nil
}
