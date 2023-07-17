//go:build simple

package main

import (
	"fmt"
	"runtime"
)

// one instance per task
type OSGroups struct {
	Task *TaskRun
}

func (osGroups *OSGroups) Start() *CommandExecutionError {
	if len(osGroups.Task.Payload.OSGroups) > 0 {
		return MalformedPayloadError(fmt.Errorf("osGroups feature is not supported on platform %v - please modify task definition and try again", runtime.GOOS))
	}
	return nil
}

func (osGroups *OSGroups) Stop(err *ExecutionErrors) {
}
