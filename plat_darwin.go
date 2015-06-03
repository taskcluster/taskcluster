package main

import (
	"os"
	"os/exec"
)

func startup() {
}

func (task *TaskRun) generateCommand() *exec.Cmd {
	cmd := exec.Command(task.Payload.Command[0], task.Payload.Command[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	task.prepEnvVars(cmd)
	return cmd
}
