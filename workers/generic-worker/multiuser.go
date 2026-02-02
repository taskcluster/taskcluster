//go:build multiuser

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v96/workers/generic-worker/runtime"
)

const (
	engine = "multiuser"
)

// validateEngineConfig validates engine-specific configuration.
// For multiuser engine, capacity > 1 requires headlessTasks to be enabled.
func validateEngineConfig() error {
	if config.Capacity > 1 && !config.HeadlessTasks {
		return fmt.Errorf("capacity > 1 requires headlessTasks to be enabled in multiuser mode (capacity=%d, headlessTasks=%v)", config.Capacity, config.HeadlessTasks)
	}
	return nil
}

var (
	runningTests bool = false
)

func secure(configFile string) {
	secureError := fileutil.SecureFiles(configFile)
	exitOnError(CANT_SECURE_CONFIG, secureError, "Not able to secure config file %q", configFile)
}

func rebootBetweenTasks() bool {
	return !config.HeadlessTasks
}

// setupTaskContext creates a TaskContext from user credentials and sets up the task directory.
// This is used after reboot in non-headless mode.
func setupTaskContext(taskUserCredentials *gwruntime.OSUser) *TaskContext {
	ctx := &TaskContext{
		User:    taskUserCredentials,
		TaskDir: filepath.Join(config.TasksDir, taskUserCredentials.Name),
	}
	// At this point, we know we have already booted into the new task user, and the user
	// is logged in.
	// Note we don't create task directory before logging in, since
	// if the task directory is also the user profile home, this
	// would mess up the windows logon process.
	err := os.MkdirAll(ctx.TaskDir, 0777) // note: 0777 is mostly ignored on windows
	if err != nil {
		panic(err)
	}
	// Make sure task user has full control of task directory. Due to
	// https://bugzilla.mozilla.org/show_bug.cgi?id=1439588#c38 we can't
	// assume previous MkdirAll has granted this permission.
	log.Printf("Granting %v control of %v", ctx.User.Name, ctx.TaskDir)
	err = makeFileOrDirReadWritableForUser(false, ctx.TaskDir, ctx.User)
	if err != nil {
		panic(err)
	}
	// Create generic-worker subdirectory for logs, etc.
	gwDir := filepath.Join(ctx.TaskDir, "generic-worker")
	err = os.MkdirAll(gwDir, 0777)
	if err != nil {
		panic(err)
	}
	log.Printf("Created dir: %v", gwDir)
	if script := config.RunAfterUserCreation; script != "" {
		// See https://bugzil.la/1559210
		// Regardless of whether we are running tasks as current user or
		// not, task initialisation steps should be run as task user.
		pdTaskUser, err := process.TaskUserPlatformData(ctx.User, config.HeadlessTasks)
		if err != nil {
			panic(err)
		}
		command, err := process.NewCommand([]string{script}, ctx.TaskDir, nil, pdTaskUser)
		if err != nil {
			panic(err)
		}
		command.DirectOutput(os.Stdout)
		result := command.Execute()
		log.Printf("%v", result)
		switch {
		case result.Failed():
			panic(result.FailureCause())
		case result.Crashed():
			panic(result.CrashCause())
		}
	}
	return ctx
}

// CreateTaskContext creates a new TaskContext for task execution.
// This is the main function used to create task contexts for all tasks.
// Panics on error (callers should use recover() if needed).
func CreateTaskContext(taskDirName string) *TaskContext {
	// For tests, load from the test user file (the daemon is started with this user)
	if runningTests {
		ntuPath := filepath.Join(cwd, "next-task-user.json")
		taskUser, err := StoredUserCredentials(ntuPath)
		if err != nil {
			panic(fmt.Errorf("failed to load test user credentials: %v", err))
		}
		return setupTaskContext(taskUser)
	}

	taskUser := &gwruntime.OSUser{
		Name:     taskDirName,
		Password: gwruntime.GeneratePassword(),
	}
	err := taskUser.CreateNew(false)
	if err != nil {
		panic(fmt.Errorf("failed to create user %s: %v", taskDirName, err))
	}
	// PreRebootSetup does platform-specific user setup (e.g., Windows profile creation)
	PreRebootSetup(taskUser)
	return setupTaskContext(taskUser)
}

// platformDataForTaskContext returns platform data for a given TaskContext.
// Used for both capacity=1 and capacity>1.
func platformDataForTaskContext(ctx *TaskContext) (*process.PlatformData, error) {
	return process.TaskUserPlatformData(ctx.User, config.HeadlessTasks)
}

// purgeOldTasks cleans up old task directories and users.
// skipDirs contains all task directory names to preserve (running tasks, etc.)
func purgeOldTasks(skipDirs ...string) error {
	if !config.CleanUpTaskDirs {
		log.Printf("WARNING: Not purging previous task directories/users since config setting cleanUpTaskDirs is false")
		return nil
	}

	deleteTaskDirs(gwruntime.UserHomeDirectoriesParent(), skipDirs...)
	deleteTaskDirs(config.TasksDir, skipDirs...)
	// regardless of whether we are running as current user or not, we should purge old task users
	err := deleteExistingOSUsers(skipDirs...)
	if err != nil {
		log.Printf("Could not delete old task users:\n%v", err)
	}
	return nil
}

// deleteExistingOSUsers removes old task users.
// skipUsers contains usernames to preserve (running tasks, etc.)
func deleteExistingOSUsers(skipUsers ...string) (err error) {
	log.Print("Looking for existing task users to delete...")
	userAccounts, err := gwruntime.ListUserAccounts()
	if err != nil {
		return
	}
	// Build set of users to skip
	skipSet := make(map[string]bool)
	for _, u := range skipUsers {
		skipSet[u] = true
	}
	allErrors := []string{}
	for _, username := range userAccounts {
		if strings.HasPrefix(username, "task_") && !skipSet[username] {
			log.Print("Attempting to remove user " + username + "...")
			err2 := gwruntime.DeleteUser(username)
			if err2 != nil {
				allErrors = append(allErrors, fmt.Sprintf("Could not remove user account %v: %v", username, err2))
			}
		}
	}
	if len(allErrors) > 0 {
		err = errors.New(strings.Join(allErrors, "\n"))
	}
	return
}

func StoredUserCredentials(path string) (*gwruntime.OSUser, error) {
	credsFile, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() {
		credsFile.Close()
	}()
	decoder := json.NewDecoder(credsFile)
	decoder.DisallowUnknownFields()
	var user gwruntime.OSUser
	err = decoder.Decode(&user)
	if err != nil {
		panic(err)
	}
	return &user, nil
}

func MkdirAllTaskUser(dir string, taskDir string, userName string, pd *process.PlatformData) error {
	if info, err := os.Stat(dir); err == nil && info.IsDir() {
		file, err := CreateFileAsTaskUser(filepath.Join(dir, slugid.Nice()), taskDir, userName, pd)
		if err != nil {
			return err
		}
		err = file.Close()
		if err != nil {
			return err
		}
		return os.Remove(file.Name())
	}

	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "create-dir", "--create-dir", dir}, taskDir, []string{}, pd)
	if err != nil {
		return fmt.Errorf("cannot create process to create directory %v as task user %v from directory %v: %v", dir, userName, taskDir, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return fmt.Errorf("cannot create directory %v as task user %v from directory %v: %v", dir, userName, taskDir, result)
	}
	return nil
}

func CreateFileAsTaskUser(file string, taskDir string, userName string, pd *process.PlatformData) (*os.File, error) {
	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "create-file", "--create-file", file}, taskDir, []string{}, pd)
	if err != nil {
		return nil, fmt.Errorf("cannot create process to create file %v as task user %v from directory %v: %v", file, userName, taskDir, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return nil, fmt.Errorf("cannot create file %v as task user %v from directory %v: %v", file, userName, taskDir, result)
	}
	return os.OpenFile(file, os.O_RDWR, 0600)
}

func featureInitFailure(err error) (exitCode ExitCode) {
	switch err.(type) {
	case *MissingED25519PrivateKey:
		exitCode = MISSING_ED25519_PRIVATE_KEY
	default:
		panic(err)
	}
	log.Print(err)
	return
}

func addEngineDebugInfo(m map[string]string, c *gwconfig.Config) {
	// sentry requires string values...
	m["headlessTasks"] = strconv.FormatBool(c.HeadlessTasks)
}

func addEngineMetadata(m map[string]any, c *gwconfig.Config) {
	// Create empty config entry if it doesn't exist already, so that if it does
	// exist, entries are merged rather than entire map being replaced.
	if _, exists := m["config"]; !exists {
		m["config"] = map[string]any{}
	}
	m["config"].(map[string]any)["headlessTasks"] = c.HeadlessTasks
}

func engineInit() {
	process.Headless = config.HeadlessTasks
}
