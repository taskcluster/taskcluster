//go:build multiuser && (darwin || linux || freebsd)

package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	osuser "os/user"
	"path/filepath"
	"runtime"
	"strconv"

	"maps"

	"github.com/taskcluster/shell"
	"github.com/taskcluster/taskcluster/v108/tools/d2g"
	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v108/workers/generic-worker/runtime"
	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/safefs"
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
	task.Commands[index], err = process.NewCommand(task.Payload.Command[index], task.TaskDir(), task.EnvVars(), task.pd)
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

	env = append(env, "TERM=xterm-256color")
	taskDir := task.TaskDir()

	if ctx == nil {
		processCmd, err = process.NewCommand(cmd, taskDir, env, task.pd)
	} else {
		processCmd, err = process.NewCommandContext(ctx, cmd, taskDir, env, task.pd)
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
	return safefs.Rename(oldpath, newpath)
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

	ctx := task.GetContext()
	// Defaults that can be overwritten by task payload env
	taskEnv["HOME"] = filepath.Join(gwruntime.UserHomeDirectoriesParent(), ctx.User.Name)
	taskEnv["PATH"] = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
	taskEnv["USER"] = ctx.User.Name

	maps.Copy(taskEnv, task.Payload.Env)

	// Values that should be overwritten if also set in task definition
	taskEnv["TASK_ID"] = task.TaskID
	taskEnv["RUN_ID"] = strconv.Itoa(int(task.RunID))
	taskEnv["TASK_WORKDIR"] = ctx.TaskDir
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

func makeFileOrDirReadWritableForUser(recurse bool, fileOrDir string, user *gwruntime.OSUser) error {
	usr, err := osuser.Lookup(user.Name)
	if err != nil {
		return fmt.Errorf("could not look up user %v: %w", user.Name, err)
	}

	uid, err := strconv.Atoi(usr.Uid)
	if err != nil {
		return fmt.Errorf("could not parse uid %q of user %v: %w", usr.Uid, user.Name, err)
	}
	gid, err := strconv.Atoi(usr.Gid)
	if err != nil {
		return fmt.Errorf("could not parse gid %q of user %v: %w", usr.Gid, user.Name, err)
	}

	log.Printf("Granting %v (%v:%v) ownership of %v", user.Name, uid, gid, fileOrDir)
	return safefs.Chown(fileOrDir, uid, gid, recurse)
}
