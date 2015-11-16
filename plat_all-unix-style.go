// +build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

func startup() error {
	debug("Detected %s platform", runtime.GOOS)
	return nil
}

func (task *TaskRun) generateCommand(index int) (Command, error) {
	cmd := exec.Command(task.Payload.Command[index][0], task.Payload.Command[index][1:]...)
	commandName := fmt.Sprintf("command_%06d", index)
	err := os.MkdirAll(filepath.Join(TaskUser.HomeDir, "public", "logs"), 0700)
	if err != nil {
		return Command{}, err
	}
	log, err := os.Create(filepath.Join(TaskUser.HomeDir, "public", "logs", commandName+".log"))
	if err != nil {
		return Command{}, err
	}
	cmd.Stdout = log
	cmd.Stderr = log
	task.prepEnvVars(cmd)
	return Command{osCommand: cmd, logFile: "public/logs/" + commandName + ".log"}, nil
}

func taskCleanup() error {
	return nil
}

func install(arguments map[string]interface{}) (err error) {
	return nil
}
