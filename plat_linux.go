package main

import (
	"os/exec"
)

func startup() error {
	debug("Detected Linux platform")
	return nil
}

func (task *TaskRun) generateCommand() (*exec.Cmd, error) {
	return task.unixCommand()
}

func taskCleanup() error {
	return nil
}
