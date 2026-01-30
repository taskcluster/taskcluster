//go:build insecure

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

	"maps"

	"github.com/taskcluster/shell"
	"github.com/taskcluster/taskcluster/v96/tools/d2g"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
)

const (
	engine = "insecure"
)

// validateEngineConfig validates engine-specific configuration.
// For insecure engine, capacity > 1 is always allowed.
func validateEngineConfig() error {
	return nil
}

func secure(configFile string) {
	log.Printf("WARNING: can't secure generic-worker config file %q", configFile)
}

func (task *TaskRun) generateInteractiveCommand(d2gConversionInfo *d2g.ConversionInfo, ctx context.Context) (*exec.Cmd, error) {
	var cmd []string
	var env []string

	if d2gConversionInfo != nil {
		pathEnv := os.Getenv("PATH")
		env = []string{"PATH=" + pathEnv}

		cmd = []string{"docker", "exec", "-it", d2gConversionInfo.ContainerName, "/bin/bash"}
	} else {
		env = task.EnvVars()
		cmd = []string{"bash"}
	}

	return task.newCommandForInteractive(cmd, env, ctx)
}

func (task *TaskRun) generateInteractiveIsReadyCommand(d2gConversionInfo *d2g.ConversionInfo, ctx context.Context) (*exec.Cmd, error) {
	pathEnv := os.Getenv("PATH")
	env := []string{"PATH=" + pathEnv}
	cmd := []string{"/bin/bash", "-cx", "/bin/[ \"`docker container inspect -f '{{.State.Running}}' " + d2gConversionInfo.ContainerName + "`\" = \"true\" ]"}

	return task.newCommandForInteractive(cmd, env, ctx)
}

func (task *TaskRun) newCommandForInteractive(cmd []string, env []string, ctx context.Context) (*exec.Cmd, error) {
	var processCmd *process.Command
	var err error

	env = append(env, "TERM=hterm-256color")

	if ctx == nil {
		processCmd, err = process.NewCommand(cmd, task.TaskDir(), env)
	} else {
		processCmd, err = process.NewCommandContext(ctx, cmd, task.TaskDir(), env)
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

// CreateTaskContext creates a new TaskContext for concurrent task execution.
// Unlike PlatformTaskEnvironmentSetup, this does not set the global taskContext.
func CreateTaskContext(taskDirName string) (*TaskContext, error) {
	ctx := &TaskContext{
		TaskDir: filepath.Join(config.TasksDir, taskDirName),
	}
	err := os.MkdirAll(ctx.TaskDir, 0777)
	if err != nil {
		return nil, err
	}
	return ctx, nil
}

// Helper function used to get the current task user's
// platform data. Useful for initially setting up the
// TaskRun struct's data.
func currentPlatformData() *process.PlatformData {
	pd, err := process.TaskUserPlatformData(taskContext.User, false)
	if err != nil {
		panic(err)
	}
	return pd
}

// platformDataForContext returns platform data for a given TaskContext.
// Used for concurrent task execution.
func platformDataForContext(ctx *TaskContext) (*process.PlatformData, error) {
	return process.TaskUserPlatformData(ctx.User, false)
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
	task.Commands[index], err = process.NewCommand(task.Payload.Command[index], task.TaskDir(), task.EnvVars())
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

func purgeOldTasks(extraSkipDirs ...string) error {
	if !config.CleanUpTaskDirs {
		log.Printf("WARNING: Not purging previous task directories/users since config setting cleanUpTaskDirs is false")
		return nil
	}
	// Build list of directories to skip.
	// For capacity=1, taskContext.TaskDir is the current task's directory.
	// For capacity>1, extraSkipDirs contains all running task directories.
	skipDirs := make([]string, 0, len(extraSkipDirs)+1)
	// Use filepath.Base(taskContext.TaskDir) rather than taskContext.User.Name
	// since taskContext.User is nil if running tasks as current user.
	if taskContext != nil && taskContext.TaskDir != "" {
		skipDirs = append(skipDirs, filepath.Base(taskContext.TaskDir))
	}
	skipDirs = append(skipDirs, extraSkipDirs...)
	deleteTaskDirs(config.TasksDir, skipDirs...)
	return nil
}

func install(arguments map[string]any) (err error) {
	return nil
}

func RenameCrossDevice(oldpath, newpath string) error {
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

func platformTargets(arguments map[string]any) ExitCode {
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
				panic(fmt.Errorf("could not interpret string %q as `key=value`", j))
			}
			taskEnv[spl[0]] = spl[1]
		}
	}
	maps.Copy(taskEnv, task.Payload.Env)
	taskEnv["TASK_ID"] = task.TaskID
	taskEnv["RUN_ID"] = strconv.Itoa(int(task.RunID))
	taskEnv["TASK_WORKDIR"] = task.TaskDir()
	taskEnv["TASK_GROUP_ID"] = task.TaskGroupID
	taskEnv["TASKCLUSTER_ROOT_URL"] = config.RootURL

	if config.WorkerLocation != "" {
		taskEnv["TASKCLUSTER_WORKER_LOCATION"] = config.WorkerLocation
	}

	if config.InstanceType != "" {
		taskEnv["TASKCLUSTER_INSTANCE_TYPE"] = config.InstanceType
	}

	for i, j := range taskEnv {
		taskEnvArray = append(taskEnvArray, i+"="+j)
	}
	log.Printf("Environment: %#v", taskEnvArray)
	return taskEnvArray
}

func featureInitFailure(err error) ExitCode {
	panic(err)
}

func addEngineDebugInfo(m map[string]string, c *gwconfig.Config) {
}

func addEngineMetadata(m map[string]any, c *gwconfig.Config) {
}

func engineInit() {
}
