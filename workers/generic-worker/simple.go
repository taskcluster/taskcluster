//go:build simple

package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/taskcluster/shell"
	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/process"
)

const (
	engine = "simple"
)

func platformFeatures() []Feature {
	return []Feature{
		&InteractiveFeature{},
		&LoopbackAudioFeature{},
		&LoopbackVideoFeature{},
	}
}

func secure(configFile string) {
	log.Printf("WARNING: can't secure generic-worker config file %q", configFile)
}

func (task *TaskRun) generateInteractiveCommand(ctx context.Context) (*exec.Cmd, error) {
	var processCmd *process.Command
	var err error

	if ctx == nil {
		processCmd, err = process.NewCommand([]string{"bash"}, taskContext.TaskDir, task.EnvVars())
	} else {
		processCmd, err = process.NewCommandContext(ctx, []string{"bash"}, taskContext.TaskDir, task.EnvVars())
	}

	return processCmd.Cmd, err
}

func (task *TaskRun) formatCommand(index int) string {
	return shell.Escape(task.Payload.Command[index]...)
}

func PlatformTaskEnvironmentSetup(taskDirName string) (reboot bool) {
	taskContext = &TaskContext{
		TaskDir: filepath.Join(config.TasksDir, taskDirName),
	}
	err := os.MkdirAll(taskContext.TaskDir, 0777)
	if err != nil {
		panic(err)
	}
	return false
}

func deleteDir(path string) error {
	log.Print("Removing directory '" + path + "'...")
	err := host.Run("/bin/chmod", "-R", "u+w", path)
	if err != nil {
		log.Print("WARNING: could not chmod -R u+w '" + path + "'")
		log.Printf("%v", err)
	}
	err = host.Run("/bin/rm", "-rf", path)
	if err != nil {
		log.Print("WARNING: could not delete directory '" + path + "'")
		log.Printf("%v", err)
		return err
	}
	return nil
}

func (task *TaskRun) generateCommand(index int) error {
	var err error
	task.Commands[index], err = process.NewCommand(task.Payload.Command[index], taskContext.TaskDir, task.EnvVars())
	if err != nil {
		return err
	}
	task.logMux.RLock()
	defer task.logMux.RUnlock()
	task.Commands[index].DirectOutput(task.logWriter)
	return nil
}

func (task *TaskRun) prepareCommand(index int) *CommandExecutionError {
	return nil
}

// Set an environment variable in each command.  This can be called from a feature's
// NewTaskFeature method to set variables for the task.
func (task *TaskRun) setVariable(variable string, value string) error {
	for i := range task.Commands {
		task.Commands[i].SetEnv(variable, value)
	}
	return nil
}

func purgeOldTasks() error {
	if !config.CleanUpTaskDirs {
		log.Printf("WARNING: Not purging previous task directories/users since config setting cleanUpTaskDirs is false")
		return nil
	}
	// Use filepath.Base(taskContext.TaskDir) rather than taskContext.User.Name
	// since taskContext.User is nil if running tasks as current user.
	deleteTaskDirs(config.TasksDir, filepath.Base(taskContext.TaskDir))
	return nil
}

func install(arguments map[string]interface{}) (err error) {
	return nil
}

func RenameCrossDevice(oldpath, newpath string) (err error) {
	// TODO: here we should be able to rename when oldpath and newpath are on
	// different partitions - for now this will cover 99% of cases.
	return os.Rename(oldpath, newpath)
}

func defaultTasksDir() string {
	// Issue 3779; default tasks directory is `tasks` relative to working directory
	return "tasks"
}

func rebootBetweenTasks() bool {
	return false
}

func platformTargets(arguments map[string]interface{}) ExitCode {
	log.Print("Internal error - no target found to run, yet command line parsing successful")
	return INTERNAL_ERROR
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
	for k, v := range task.Payload.Env {
		taskEnv[k] = v
	}
	taskEnv["TASK_ID"] = task.TaskID
	taskEnv["RUN_ID"] = strconv.Itoa(int(task.RunID))
	taskEnv["TASKCLUSTER_ROOT_URL"] = config.RootURL

	if config.WorkerLocation != "" {
		taskEnv["TASKCLUSTER_WORKER_LOCATION"] = config.WorkerLocation
	}

	for i, j := range taskEnv {
		taskEnvArray = append(taskEnvArray, i+"="+j)
	}
	log.Printf("Environment: %#v", taskEnvArray)
	return taskEnvArray
}
