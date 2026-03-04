package main

import "fmt"

func (task *TaskRun) convertDockerWorkerPayload() *CommandExecutionError {
	return executionError(malformedPayload, errored, fmt.Errorf("docker worker payload conversion using d2g is not supported on Windows"))
}
