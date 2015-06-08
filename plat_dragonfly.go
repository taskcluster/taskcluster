package main

import (
	"fmt"
	"os/exec"
)

func startup() {
	fmt.Println("Detected Dragonfly platform")
}

func (task *TaskRun) generateCommand() (*exec.Cmd, error) {
	return task.unixCommand()
}
