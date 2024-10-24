package main

import "fmt"

func (aptt *AllowPtraceTask) ensurePlatform() *CommandExecutionError {
	return executionError(malformedPayload, errored, fmt.Errorf("allowPtrace feature toggle is not supported on macOS"))
}
