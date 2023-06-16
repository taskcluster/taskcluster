//go:build freebsd

package main

import (
	"fmt"
)

func setupVideoDevice(task *TaskRun) *CommandExecutionError {
	return executionError(malformedPayload, errored, fmt.Errorf("Loopback video device is not supported on FreeBSD"))
}

func resetVideoDevice() *CommandExecutionError {
	return nil
}
