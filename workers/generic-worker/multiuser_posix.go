//go:build multiuser && (darwin || linux || freebsd)

package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"

	"github.com/taskcluster/shell"
	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v54/workers/generic-worker/runtime"
)

func (task *TaskRun) formatCommand(index int) string {
	return shell.Escape(task.Payload.Command[index]...)
}

func platformFeatures() []Feature {
	return []Feature{
		&InteractiveFeature{},
		&LoopbackAudioFeature{},
		&LoopbackVideoFeature{},
		// keep chain of trust as low down as possible, as it checks permissions
		// of signing key file, and a feature could change them, so we want these
		// checks as late as possible
		&ChainOfTrustFeature{},
	}
}

func deleteDir(path string) error {
	log.Print("Removing directory '" + path + "'...")
	err := host.Run("/usr/bin/sudo", "/bin/chmod", "-R", "u+w", path)
	if err != nil {
		log.Print("WARNING: could not chmod -R u+w '" + path + "'")
		log.Printf("%v", err)
	}
	err = host.Run("/usr/bin/sudo", "/bin/rm", "-rf", path)
	if err != nil {
		log.Print("WARNING: could not delete directory '" + path + "'")
		log.Printf("%v", err)
		return err
	}
	return nil
}

func (task *TaskRun) generateCommand(index int) error {
	var err error
	task.Commands[index], err = process.NewCommand(task.Payload.Command[index], taskContext.TaskDir, task.EnvVars(), taskContext.pd)
	if err != nil {
		return err
	}
	task.logMux.RLock()
	defer task.logMux.RUnlock()
	task.Commands[index].DirectOutput(task.logWriter)
	return nil
}

func (task *TaskRun) generateInteractiveCommand(ctx context.Context) (*exec.Cmd, error) {
	var processCmd *process.Command
	var err error

	if ctx == nil {
		processCmd, err = process.NewCommand([]string{"bash"}, taskContext.TaskDir, task.EnvVars(), taskContext.pd)
	} else {
		processCmd, err = process.NewCommandContext(ctx, []string{"bash"}, taskContext.TaskDir, task.EnvVars(), taskContext.pd)
	}

	return processCmd.Cmd, err
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

func install(arguments map[string]interface{}) (err error) {
	return nil
}

func RenameCrossDevice(oldpath, newpath string) (err error) {
	// TODO: here we should be able to rename when oldpath and newpath are on
	// different partitions - for now this will cover 99% of cases.
	return os.Rename(oldpath, newpath)
}

func defaultTasksDir() string {
	// assume all user home directories are all in same folder, i.e. the parent
	// folder of the current user's home folder
	return filepath.Dir(os.Getenv("HOME"))
}

func rebootBetweenTasks() bool {
	return true
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
	taskEnv := map[string]string{}
	taskEnvArray := []string{}

	// Defaults that can be overwritten by task payload env
	taskEnv["HOME"] = filepath.Join(gwruntime.UserHomeDirectoriesParent(), taskContext.User.Name)
	taskEnv["PATH"] = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
	taskEnv["USER"] = taskContext.User.Name

	for k, v := range task.Payload.Env {
		taskEnv[k] = v
	}

	// Values that should be overwritten if also set in task definition
	taskEnv["TASK_ID"] = task.TaskID
	taskEnv["RUN_ID"] = strconv.Itoa(int(task.RunID))
	taskEnv["TASKCLUSTER_ROOT_URL"] = config.RootURL
	if config.RunTasksAsCurrentUser {
		taskEnv["TASK_USER_CREDENTIALS"] = filepath.Join(cwd, "current-task-user.json")
	}
	if runtime.GOOS == "linux" {
		taskEnv["DISPLAY"] = ":0"
	}
	if config.WorkerLocation != "" {
		taskEnv["TASKCLUSTER_WORKER_LOCATION"] = config.WorkerLocation
	}

	for i, j := range taskEnv {
		taskEnvArray = append(taskEnvArray, i+"="+j)
	}
	log.Printf("Environment: %#v", taskEnvArray)
	return taskEnvArray
}

func PreRebootSetup(nextTaskUser *gwruntime.OSUser) {
}

func MkdirAllTaskUser(dir string, perms os.FileMode) (err error) {
	cmd, err := process.NewCommand([]string{"mkdir", "-p", dir}, taskContext.TaskDir, []string{}, taskContext.pd)
	if err != nil {
		return fmt.Errorf("Cannot create process to create directory %v with permissions %v as task user %v from directory %v: %v", dir, perms, taskContext.User.Name, taskContext.TaskDir, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return fmt.Errorf("Cannot create directory %v with permissions %v as task user %v from directory %v: %v", dir, perms, taskContext.User.Name, taskContext.TaskDir, result)
	}
	return nil
}

func makeFileOrDirReadWritableForUser(recurse bool, fileOrDir string, user *gwruntime.OSUser) error {
	// We'll use chown binary rather that os.Chown here since:
	// 1) we have user/group names not ids, and can avoid extra code to look up
	//    their values
	// 2) Perhaps we would need a CGO_ENABLED build to call user.Lookup and
	//    user.LookupGroup (see https://bugzil.la/1566159)
	// 3) os.Chown doesn't have a recursive option; maybe a third party library
	//    does, but that's more bloat to import/maintain, or we'd need to write
	//    our own
	// 4) we get logging of commands run for free
	if recurse {
		switch runtime.GOOS {
		case "darwin":
			return host.Run("/usr/sbin/chown", "-R", user.Name+":staff", fileOrDir)
		case "linux":
			return host.Run("/bin/chown", "-R", user.Name+":"+user.Name, fileOrDir)
		case "freebsd":
			return host.Run("/usr/sbin/chown", "-R", user.Name+":"+user.Name, fileOrDir)
		}
		return fmt.Errorf("Unknown platform: %v", runtime.GOOS)
	}
	switch runtime.GOOS {
	case "darwin":
		return host.Run("/usr/sbin/chown", user.Name+":staff", fileOrDir)
	case "linux":
		return host.Run("/bin/chown", user.Name+":"+user.Name, fileOrDir)
	case "freebsd":
		return host.Run("/usr/sbin/chown", user.Name+":"+user.Name, fileOrDir)
	}
	return fmt.Errorf("Unknown platform: %v", runtime.GOOS)
}

func makeDirUnreadableForUser(dir string, user *gwruntime.OSUser) error {
	// Note, only need to set top directory, not recursively, since without
	// access to top directory, nothing inside can be read anyway
	var err error
	switch runtime.GOOS {
	case "darwin":
		err = host.Run("/usr/sbin/chown", "0:0", dir)
	case "linux":
		err = host.Run("/bin/chown", "0:0", dir)
	}
	if err != nil {
		return fmt.Errorf("[mounts] Not able to make directory %v owned by root/root in order to prevent %v from having access: %v", dir, user.Name, err)
	}
	return os.Chmod(dir, 0700)
}
