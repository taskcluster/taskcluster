package main

import (
	"os/exec"
)

func startup() {
}

func (task *TaskRun) generateCommand() *exec.Cmd {
	// TODO: below is the *nix implementation, Windows needs to generate a .bat file
	// and run it using PsExec instead...
	cmd := exec.Command(task.Payload.Command[0], task.Payload.Command[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	task.prepEnvVars(cmd)
	return cmd
}
