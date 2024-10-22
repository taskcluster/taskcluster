package main

import "fmt"

func (kvmt *KVMTask) ensurePlatform() *CommandExecutionError {
	return executionError(malformedPayload, errored, fmt.Errorf("kvm feature toggle is not supported on macOS"))
}
