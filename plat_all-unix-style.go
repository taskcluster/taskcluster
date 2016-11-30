// +build !windows

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/taskcluster/generic-worker/process"
	"github.com/taskcluster/shell"
)

type OSUser struct {
	TaskDir  string
	Name     string
	Password string
}

func immediateShutdown(cause string) {
	if config.ShutdownMachineOnInternalError {
		cmd := exec.Command("shutdown", "now", cause)
		err := cmd.Run()
		if err != nil {
			log.Fatal(err)
		}
	}
	os.Exit(64)
}

// we put this in init() instead of startup() as we want tests to be able to change
// it - note we shouldn't have these nasty global vars, I can only apologise, and
// say taskcluster-worker will be much nicer
func init() {
	pwd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	TaskUser = &OSUser{
		TaskDir:  pwd,
		Name:     "",
		Password: "",
	}
}

func startup() error {
	log.Printf("Detected %s platform", runtime.GOOS)
	return os.MkdirAll(filepath.Join(TaskUser.TaskDir, "public", "logs"), 0700)
}

func (task *TaskRun) prepareCommand(index int) error {
	return nil
}

func (task *TaskRun) generateCommand(index int) error {
	var err error
	task.Commands[index], err = process.NewCommand(task.Payload.Command[index], TaskUser.TaskDir, task.EnvVars())
	if err != nil {
		return err
	}
	task.Commands[index].DirectOutput(task.logWriter)
	return nil
}

func taskCleanup() error {
	return nil
}

func install(arguments map[string]interface{}) (err error) {
	return nil
}

func (task *TaskRun) EnvVars() []string {
	workerEnv := os.Environ()
	taskEnv := map[string]string{}
	taskEnvArray := []string{}
	for _, j := range workerEnv {
		if !strings.HasPrefix(j, "TASKCLUSTER_ACCESS_TOKEN=") {
			spl := strings.SplitN(j, "=", 2)
			if len(spl) != 2 {
				panic(fmt.Errorf("Could not interpret string %q as `key=value`", j))
			}
			taskEnv[spl[0]] = spl[1]
		}
	}
	if task.Payload.Env != nil {
		err := json.Unmarshal(task.Payload.Env, &taskEnv)
		if err != nil {
			panic(err)
		}
	}
	taskEnv["TASK_ID"] = task.TaskID
	for i, j := range taskEnv {
		taskEnvArray = append(taskEnvArray, i+"="+j)
	}
	log.Printf("Environment: %#v", taskEnvArray)
	return taskEnvArray
}

func makeDirReadable(dir string) error {
	return os.Chmod(dir, 0777)
}

func makeDirUnreadable(dir string) error {
	return os.Chmod(dir, 0700)
}

func RenameCrossDevice(oldpath, newpath string) error {
	// TODO: here we should be able to rename when oldpath and newpath are on
	// different partitions - for now this will cover 99% of cases, and we
	// currently don't have non-windows platforms in production, so not
	// currently high priority
	return os.Rename(oldpath, newpath)
}

func (task *TaskRun) addGroupsToUser(groups []string) error {
	if len(groups) == 0 {
		return nil
	}
	if config.RunTasksAsCurrentUser {
		task.Logf("Not adding user %v to groups %v since we are running as current user.", TaskUser.Name, groups)
		return nil
	}
	return fmt.Errorf("Not able to add groups %v to user %v on platform %v - feature not supported.", groups, TaskUser.Name, runtime.GOOS)
}

func (task *TaskRun) formatCommand(index int) string {
	return shell.Escape(task.Payload.Command[index]...)
}
