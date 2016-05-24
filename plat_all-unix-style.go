// +build !windows

package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func exceptionOrFailure(errCommand error) *CommandExecutionError {
	switch errCommand.(type) {
	case *exec.ExitError:
		return &CommandExecutionError{
			Cause:      errCommand,
			TaskStatus: Failed,
		}
	}
	return WorkerShutdown(errCommand)
}

func immediateShutdown() {
	cmd := exec.Command("shutdown", "now")
	err := cmd.Run()
	if err != nil {
		log.Fatal(err)
	}
}

func startup() error {
	log.Printf("Detected %s platform", runtime.GOOS)
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

func (task *TaskRun) prepEnvVars(cmd *exec.Cmd) {
	workerEnv := os.Environ()
	taskEnv := make([]string, 0)
	for _, j := range workerEnv {
		if !strings.HasPrefix(j, "TASKCLUSTER_ACCESS_TOKEN=") {
			log.Printf("Setting env var: %v", j)
			taskEnv = append(taskEnv, j)
		}
	}
	for i, j := range task.Payload.Env {
		log.Printf("Setting env var: %v=%v", i, j)
		taskEnv = append(taskEnv, i+"="+j)
	}
	cmd.Env = taskEnv
	log.Printf("Environment: %v", taskEnv)
}
