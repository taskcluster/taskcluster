package main

import (
	"os/exec"
)

func startup() error {
	debug("Detected Solaris platform")
	return nil
}

func (task *TaskRun) generateCommand() (*exec.Cmd, error) {
	return task.unixCommand()
}

func taskCleanup() error {
	return nil
}
