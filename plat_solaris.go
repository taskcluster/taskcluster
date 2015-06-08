package main

import (
	"fmt"
	"os/exec"
)

func startup() {
	fmt.Println("Detected Solaris platform")
}

func (task *TaskRun) generateCommand() (*exec.Cmd, error) {
	return task.unixCommand()
}
