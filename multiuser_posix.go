// +build multiuser,darwin multiuser,linux

package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/taskcluster/generic-worker/kc"
	"github.com/taskcluster/generic-worker/process"
	"github.com/taskcluster/generic-worker/runtime"
	gwruntime "github.com/taskcluster/generic-worker/runtime"
	"github.com/taskcluster/shell"
)

func (task *TaskRun) formatCommand(index int) string {
	return shell.Escape(task.Payload.Command[index]...)
}

func platformFeatures() []Feature {
	return []Feature{
		// keep chain of trust as low down as possible, as it checks permissions
		// of signing key file, and a feature could change them, so we want these
		// checks as late as possible
		&ChainOfTrustFeature{},
	}
}

func immediateReboot() {
	log.Println("Immediate reboot being issued...")
	cause := "generic-worker requested reboot"
	log.Println(cause)
	cmd := exec.Command("/usr/bin/sudo", "/sbin/shutdown", "-r", "now", cause)
	err := cmd.Run()
	if err != nil {
		log.Fatal(err)
	}
}

func immediateShutdown(cause string) {
	log.Println("Immediate shutdown being issued...")
	log.Println(cause)
	cmd := exec.Command("/usr/bin/sudo", "/sbin/shutdown", "-h", "now", cause)
	err := cmd.Run()
	if err != nil {
		log.Fatal(err)
	}
}

func deleteDir(path string) error {
	log.Print("Removing directory '" + path + "'...")
	out, err := exec.Command("/usr/bin/sudo", "/bin/rm", "-rf", path).CombinedOutput()
	if err != nil {
		log.Print("WARNING: could not delete directory '" + path + "': " + string(out))
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

func ChownR(path string, uid, gid int) error {
	return filepath.Walk(path, func(name string, info os.FileInfo, err error) error {
		if err == nil {
			err = os.Chown(name, uid, gid)
		}
		return err
	})
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

func AutoLogonCredentials() (user runtime.OSUser) {
	username, password, err := kc.AutoLoginUser()
	if err != nil {
		log.Print("Error fetching auto-logon credentials: " + err.Error())
		return
	}
	log.Print("Auto logon user: " + username)
	return runtime.OSUser{
		Name:     username,
		Password: string(password),
	}
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

func SetAutoLogin(user *runtime.OSUser) error {
	return kc.SetAutoLogin(user.Name, []byte(user.Password))
}

func (task *TaskRun) EnvVars() []string {
	taskEnv := map[string]string{}
	taskEnvArray := []string{}

	// Defaults that can be overwritten by task payload env
	taskEnv["HOME"] = filepath.Join(runtime.UserHomeDirectoriesParent(), taskContext.User.Name)
	taskEnv["PATH"] = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
	taskEnv["USER"] = taskContext.User.Name

	for k, v := range task.Payload.Env {
		taskEnv[k] = v
	}

	// Values that should be overwritten if also set in task definition
	taskEnv["TASK_ID"] = task.TaskID
	taskEnv["TASKCLUSTER_ROOT_URL"] = config.RootURL
	if config.RunTasksAsCurrentUser {
		taskEnv["TASK_USER_CREDENTIALS"] = filepath.Join(cwd, "current-task-user.json")
	}

	for i, j := range taskEnv {
		taskEnvArray = append(taskEnvArray, i+"="+j)
	}
	log.Printf("Environment: %#v", taskEnvArray)
	return taskEnvArray
}

func PreRebootSetup(nextTaskUser *runtime.OSUser) {
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

func makeFileOrDirReadWritableForUser(recurse bool, dir string, user *gwruntime.OSUser) ([]byte, error) {
	if recurse {
		return exec.Command("/usr/sbin/chown", "-R", user.Name+":staff", dir).CombinedOutput()
	}
	return exec.Command("/usr/sbin/chown", user.Name+":staff", dir).CombinedOutput()
}

func makeDirUnreadableForUser(dir string, user *gwruntime.OSUser) ([]byte, error) {
	// Note, only need to set top directory, not recursively, since without
	// access to top directory, nothing inside can be read anyway
	err := os.Chown(dir, 0, 0) // root user / root group
	if err != nil {
		return []byte{}, fmt.Errorf("[mounts] Not able to make directory %v owned by root/root in order to prevent %v from having access: %v", dir, user.Name, err)
	}
	return []byte{}, os.Chmod(dir, 0700)
}
