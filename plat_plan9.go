package main

import (
	"fmt"
	"os/exec"
)

func startup() {
	fmt.Println("Detected Plan 9 platform")
}

func (task *TaskRun) generateCommand() (*exec.Cmd, error) {
	return task.unixCommand()
}
