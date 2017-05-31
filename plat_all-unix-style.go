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
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/generic-worker/process"
	"github.com/taskcluster/shell"
)

type OSUser struct {
	HomeDir  string
	Name     string
	Password string
}

type TaskContext struct {
	TaskDir string
	User    *OSUser
}

func immediateShutdown(cause string) {
	log.Println("Immediate shutdown being issued...")
	log.Println(cause)
	cmd := exec.Command("shutdown", "now", cause)
	err := cmd.Run()
	if err != nil {
		log.Fatal(err)
	}
}

func immediateReboot() {
	log.Println("Immediate reboot being issued...")
	cause := "generic-worker requested reboot"
	log.Println(cause)
	cmd := exec.Command("shutdown", "/r", "now", cause)
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
	taskContext = &TaskContext{
		TaskDir: pwd,
	}
}

func (task *TaskRun) prepareCommand(index int) error {
	return nil
}

func (task *TaskRun) generateCommand(index int) error {
	var err error
	task.Commands[index], err = process.NewCommand(task.Payload.Command[index], taskContext.TaskDir, task.EnvVars())
	if err != nil {
		return err
	}
	task.Commands[index].DirectOutput(task.logWriter)
	return nil
}

func taskCleanup() error {
	if config.CleanUpTaskDirs {
		deleteTaskDirs()
	}
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

func makeDirReadableForTaskUser(dir string) error {
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
	return fmt.Errorf("Not able to add groups %v to user on platform %v - feature not supported.", groups, runtime.GOOS)
}

func (task *TaskRun) formatCommand(index int) string {
	return shell.Escape(task.Payload.Command[index]...)
}

func prepareTaskUser(username string) bool {
	taskContext.User = &OSUser{
		Name: username,
	}
	err := os.MkdirAll(taskContext.TaskDir, 0777)
	if err != nil {
		panic(err)
	}
	return false
}

func deleteTaskDir(path string) error {
	log.Print("Removing task directory '" + path + "'...")
	err := os.RemoveAll(path)
	if err != nil {
		log.Print("WARNING: could not delete directory '" + path + "'")
		log.Printf("%v", err)
		return err
	}
	return nil
}

func defaultTasksDir() string {
	// assume all user home directories are all in same folder, i.e. the parent
	// folder of the current user's home folder
	return filepath.Dir(os.Getenv("HOME"))
}

// N/A for unix - just a windows thing
func AutoLogonUser() string {
	return ""
}

func chooseTaskDirName() string {
	return "task_" + strconv.Itoa(int(time.Now().Unix()))
}

func unsetAutoLogon() {
}

func deleteTaskDirs() {
	removeTaskDirs(config.TasksDir)
}
