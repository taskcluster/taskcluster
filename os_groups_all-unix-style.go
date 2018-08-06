// +build !windows

package main

import (
	"fmt"
	"runtime"
)

func (osGroups *OSGroups) Start() *CommandExecutionError {
	if len(osGroups.Task.Payload.OSGroups) > 0 {
		return MalformedPayloadError(fmt.Errorf("osGroups feature is not supported on platform %v - please modify task definition and try again", runtime.GOOS))
	}
	return nil
}

func (osGroups *OSGroups) Stop(err *ExecutionErrors) {
}
