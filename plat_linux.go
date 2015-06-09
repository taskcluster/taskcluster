package main

import (
	"fmt"
	"os/exec"
)

func startup() error {
	fmt.Println("Detected Linux platform")
	return nil
}

func (task *TaskRun) generateCommand() (*exec.Cmd, error) {
	return task.unixCommand()
}
