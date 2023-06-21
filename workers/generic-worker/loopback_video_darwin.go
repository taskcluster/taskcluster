//go:build darwin

package main

import (
	"fmt"
)

func (lvt *LoopbackVideoTask) setupVideoDevice() *CommandExecutionError {
	return executionError(malformedPayload, errored, fmt.Errorf("Loopback video device is not supported on macOS"))
}

func (lvt *LoopbackVideoTask) resetVideoDevice() *CommandExecutionError {
	return nil
}
