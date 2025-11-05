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

	"maps"

	"github.com/taskcluster/shell"
	"github.com/taskcluster/taskcluster/v92/tools/d2g"
	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v92/workers/generic-worker/runtime"
)

func (task *TaskRun) formatCommand(index int) string {
	return shell.Escape(task.Payload.Command[index]...)
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
	task.Commands[index], err = process.NewCommand(task.Payload.Command[index], taskContext.TaskDir, task.EnvVars(), task.pd)
	if err != nil {
		return err
	}
	task.logMux.RLock()
	defer task.logMux.RUnlock()
	task.Commands[index].DirectOutput(task.logWriter)
	return nil
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
		processCmd, err = process.NewCommand(cmd, taskContext.TaskDir, env, task.pd)
	} else {
		processCmd, err = process.NewCommandContext(ctx, cmd, taskContext.TaskDir, env, task.pd)
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

func install(arguments map[string]any) (err error) {
	return nil
}

func RenameCrossDevice(oldpath, newpath string) error {
	// TODO: here we should be able to rename when oldpath and newpath are on
	// different partitions - for now this will cover 99% of cases.
	return os.Rename(oldpath, newpath)
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

	maps.Copy(taskEnv, task.Payload.Env)

	// Values that should be overwritten if also set in task definition
	taskEnv["TASK_ID"] = task.TaskID
	taskEnv["RUN_ID"] = strconv.Itoa(int(task.RunID))
	taskEnv["TASK_WORKDIR"] = taskContext.TaskDir
	taskEnv["TASK_GROUP_ID"] = task.TaskGroupID
	taskEnv["TASKCLUSTER_ROOT_URL"] = config.RootURL
	if runtime.GOOS == "linux" && !config.HeadlessTasks {
		taskEnv["DISPLAY"] = ":0"
		taskEnv["XDG_RUNTIME_DIR"] = "/run/user/" + strconv.Itoa(int(task.pd.SysProcAttr.Credential.Uid))
	}
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

func changeOwnershipInDir(dir, newOwnerUsername string, cache *Cache) error {
	if dir == "" || newOwnerUsername == "" || cache == nil {
		return fmt.Errorf("directory path, new owner username, and cache must not be empty")
	}

	// Do nothing if the current owner is the same as the new owner
	if cache.OwnerUsername == newOwnerUsername {
		return nil
	}

	switch runtime.GOOS {
	case "darwin":
		return host.Run("/usr/sbin/chown", "-R", newOwnerUsername+":staff", dir)
	case "linux":
		return host.Run("/usr/bin/chown", "-R", "--quiet", "--from", cache.OwnerUID, newOwnerUsername+":"+newOwnerUsername, dir)
	case "freebsd":
		return host.Run("/usr/sbin/chown", "-R", newOwnerUsername+":"+newOwnerUsername, dir)
	}
	return fmt.Errorf("unknown platform: %v", runtime.GOOS)
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
		return fmt.Errorf("unknown platform: %v", runtime.GOOS)
	}
	switch runtime.GOOS {
	case "darwin":
		return host.Run("/usr/sbin/chown", user.Name+":staff", fileOrDir)
	case "linux":
		return host.Run("/bin/chown", user.Name+":"+user.Name, fileOrDir)
	case "freebsd":
		return host.Run("/usr/sbin/chown", user.Name+":"+user.Name, fileOrDir)
	}
	return fmt.Errorf("unknown platform: %v", runtime.GOOS)
}
