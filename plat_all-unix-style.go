// +build !windows

package main

import (
	"fmt"
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

// we put this in init() instead of startup() as we want tests to be able to change
// it - note we shouldn't have these nasty global vars, I can only apologise, and
// say taskcluster-worker will be much nicer
func init() {
	pwd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	TaskUser = OSUser{
		HomeDir:  pwd,
		Name:     "",
		Password: "",
	}
}

func startup() error {
	log.Printf("Detected %s platform", runtime.GOOS)
	return os.MkdirAll(filepath.Join(TaskUser.HomeDir, "public", "logs"), 0700)
}

func (task *TaskRun) generateCommand(index int) error {
	cmd := exec.Command(task.Payload.Command[index][0], task.Payload.Command[index][1:]...)
	cmd.Stdout = task.logWriter
	cmd.Stderr = task.logWriter
	// cmd.Stdout = log
	// cmd.Stderr = log
	task.prepEnvVars(cmd)
	task.Commands[index] = Command{osCommand: cmd}
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
	taskEnv := []string{}
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

func (task *TaskRun) describeCommand(index int) string {
	return fmt.Sprintf("%q", task.Payload.Command[index])
}
