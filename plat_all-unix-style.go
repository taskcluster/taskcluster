// +build !windows

package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

func startup() error {
	debug("Detected %s platform", runtime.GOOS)
	return nil
}

func (task *TaskRun) generateCommand(index int, writer io.Writer) error {
	cmd := exec.Command(task.Payload.Command[index][0], task.Payload.Command[index][1:]...)
	commandName := fmt.Sprintf("command_%06d", index)
	err := os.MkdirAll(filepath.Join(TaskUser.HomeDir, "public", "logs"), 0700)
	if err != nil {
		return err
	}
	log, err := os.Create(filepath.Join(TaskUser.HomeDir, "public", "logs", commandName+".log"))
	if err != nil {
		return err
	}
	multiWriter := io.MultiWriter(writer, log)
	cmd.Stdout = multiWriter
	cmd.Stderr = multiWriter
	// cmd.Stdout = log
	// cmd.Stderr = log
	task.prepEnvVars(cmd)
	task.Commands[index] = Command{osCommand: cmd, logFile: "public/logs/" + commandName + ".log"}
	return nil
}

func taskCleanup() error {
	return nil
}

func install(arguments map[string]interface{}) (err error) {
	return nil
}
