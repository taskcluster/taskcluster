// +build darwin linux

package main

import (
	"fmt"
	"runtime"
)

// TODO: osGroups should be a feature of multiuser engine, i.e. engine-specific, not platform-specific
func (osGroups *OSGroups) Start() *CommandExecutionError {
	if len(osGroups.Task.Payload.OSGroups) > 0 {
		return MalformedPayloadError(fmt.Errorf("osGroups feature is not supported on platform %v - please modify task definition and try again", runtime.GOOS))
	}
	return nil
}

func (osGroups *OSGroups) Stop(err *ExecutionErrors) {
}
