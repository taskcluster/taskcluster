package main

import (
	"fmt"
	"os/exec"
)

func startup() {
	fmt.Println("Detected Net BSD platform")
}

func (task *TaskRun) generateCommand() (*exec.Cmd, error) {
	return task.unixCommand()
}
