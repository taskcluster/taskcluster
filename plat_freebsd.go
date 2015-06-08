package main

import (
	"fmt"
	"os/exec"
)

func startup() {
	fmt.Println("Detected Free BSD platform")
}

func (task *TaskRun) generateCommand() (*exec.Cmd, error) {
	return task.unixCommand()
}
