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
	"time"

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
	// don't initialise here, because cwd might not yet be initialised
	// instead we set up later in prepareTaskEnvironment
	ctuPath      string
	ntuPath      string
	nextTaskUser string
	runningTests bool = false
)

func secure(configFile string) {
	secureError := fileutil.SecureFiles(configFile)
	exitOnError(CANT_SECURE_CONFIG, secureError, "Not able to secure config file %q", configFile)
}

func rebootBetweenTasks() bool {
	return !config.HeadlessTasks
}

// PostRebootSetup creates a TaskContext from user credentials and sets up the task directory.
// This is used after reboot in non-headless mode and returns the context.
func PostRebootSetup(taskUserCredentials *gwruntime.OSUser) *TaskContext {
	ctx := &TaskContext{
		User:    taskUserCredentials,
		TaskDir: filepath.Join(config.TasksDir, taskUserCredentials.Name),
	}
	// At this point, we know we have already booted into the new task user, and the user
	// is logged in.
	// Note we don't create task directory before logging in, since
	// if the task directory is also the user profile home, this
	// would mess up the windows logon process.
	if !config.HeadlessTasks && !runningTests {
		err := gwruntime.WaitForLoginCompletion(5*time.Minute, ctx.User.Name)
		if err != nil {
			panic(fmt.Errorf("timed out waiting for login for user %s: %v", ctx.User.Name, err))
		}
	}
	// Ensure the parent TasksDir exists and is traversable by all users.
	// The per-task subdirectory below is then restricted to 0700.
	err := os.MkdirAll(config.TasksDir, 0755)
	if err != nil {
		panic(err)
	}
	err = os.MkdirAll(ctx.TaskDir, 0700) // note: 0700 is mostly ignored on windows
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
	// Exception: In Docker, we exercise the real headless user creation path
	if runningTests && os.Getenv("GW_IN_DOCKER") != "1" {
		ntuPath := filepath.Join(cwd, "next-task-user.json")
		taskUser, err := StoredUserCredentials(ntuPath)
		if err != nil {
			panic(fmt.Errorf("failed to load test user credentials: %v", err))
		}
		return PostRebootSetup(taskUser)
	}

	if !config.HeadlessTasks {
		if taskContext == nil || taskContext.User == nil {
			panic("taskContext not initialised for non-headless tasks; ensure prepareTaskEnvironment ran")
		}
		return taskContext
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
	return PostRebootSetup(taskUser)
}

// prepareTaskEnvironment sets up the task environment before claiming work.
// For non-headless multiuser, this may require a reboot to auto-login.
func prepareTaskEnvironment() (reboot bool) {
	if runningTests || config.HeadlessTasks {
		return false
	}

	// Windows username limit is 20 characters.
	taskDirName := fmt.Sprintf("task_%v", time.Now().UnixNano())
	if len(taskDirName) > 20 {
		taskDirName = taskDirName[:20]
	}

	ctuPath = filepath.Join(cwd, "current-task-user.json")
	ntuPath = filepath.Join(cwd, "next-task-user.json")

	log.Printf("Current task user file: %q", ctuPath)
	log.Printf("Next task user file: %q", ntuPath)

	nextTaskUser = ""
	reboot = true

	// If next-task-user.json exists, we are expected to be logged in as that user.
	if _, err := os.Stat(ntuPath); err == nil {
		_, err = fileutil.Copy(ctuPath, ntuPath)
		if err != nil {
			panic(err)
		}
		err = fileutil.SecureFiles(ctuPath)
		if err != nil {
			panic(err)
		}

		taskUserCredentials, err := StoredUserCredentials(ctuPath)
		if err != nil {
			panic(err)
		}

		taskContext = PostRebootSetup(taskUserCredentials)
		reboot = false

		// If there is precisely one more task to run, no need to create a future task user.
		if config.NumberOfTasksToRun == 1 {
			return false
		}
	}

	// Bug 1533694
	//
	// Create user for subsequent task run already, before we've run current
	// task, in case worker restarts unexpectedly during current task, due to
	// e.g. Blue Screen of Death.

	// Regardless of whether we run tasks as current user or not, we should
	// make sure there is a task user created - since runTasksAsCurrentUser is
	// now only something for CI so on Windows a generic-worker test can
	// execute in the context of a Windows Service running under LocalSystem
	// account. Username can only be 20 chars, uuids are too long, therefore
	// use prefix (5 chars) plus seconds since epoch (10 chars).

	nextUser := &gwruntime.OSUser{
		Name:     taskDirName,
		Password: gwruntime.GeneratePassword(),
	}
	err := nextUser.CreateNew(false)
	if err != nil {
		panic(err)
	}
	PreRebootSetup(nextUser)
	// configure worker to auto-login to this newly generated user account
	err = gwruntime.SetAutoLogin(nextUser)
	if err != nil {
		panic(err)
	}
	err = fileutil.WriteToFileAsJSON(nextUser, ntuPath)
	if err != nil {
		panic(err)
	}
	err = fileutil.SecureFiles(ntuPath)
	if err != nil {
		panic(err)
	}

	nextTaskUser = taskDirName

	return
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

	skipSet := make(map[string]bool)
	for _, s := range skipDirs {
		skipSet[s] = true
	}
	if taskContext != nil && taskContext.User != nil && taskContext.User.Name != "" {
		skipSet[taskContext.User.Name] = true
	}
	if nextTaskUser != "" {
		skipSet[nextTaskUser] = true
	}
	skips := make([]string, 0, len(skipSet))
	for s := range skipSet {
		skips = append(skips, s)
	}

	deleteTaskDirs(gwruntime.UserHomeDirectoriesParent(), skips...)
	deleteTaskDirs(config.TasksDir, skips...)
	// regardless of whether we are running as current user or not, we should purge old task users
	err := deleteExistingOSUsers(skips...)
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

func MkdirAllTaskUser(dir string, ctx *TaskContext, pd *process.PlatformData) error {
	if info, err := os.Stat(dir); err == nil && info.IsDir() {
		file, err := CreateFileAsTaskUser(filepath.Join(dir, slugid.Nice()), ctx, pd)
		if err != nil {
			return err
		}
		err = file.Close()
		if err != nil {
			return err
		}
		return os.Remove(file.Name())
	}

	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "create-dir", "--create-dir", dir}, ctx.TaskDir, []string{}, pd)
	if err != nil {
		return fmt.Errorf("cannot create process to create directory %v as task user %v from directory %v: %v", dir, ctx.User.Name, ctx.TaskDir, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return fmt.Errorf("cannot create directory %v as task user %v from directory %v: %v", dir, ctx.User.Name, ctx.TaskDir, result)
	}
	return nil
}

func CreateFileAsTaskUser(file string, ctx *TaskContext, pd *process.PlatformData) (*os.File, error) {
	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "create-file", "--create-file", file}, ctx.TaskDir, []string{}, pd)
	if err != nil {
		return nil, fmt.Errorf("cannot create process to create file %v as task user %v from directory %v: %v", file, ctx.User.Name, ctx.TaskDir, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return nil, fmt.Errorf("cannot create file %v as task user %v from directory %v: %v", file, ctx.User.Name, ctx.TaskDir, result)
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
	m["capacity"] = strconv.Itoa(int(c.Capacity))
}

func addEngineMetadata(m map[string]any, c *gwconfig.Config) {
	// Create empty config entry if it doesn't exist already, so that if it does
	// exist, entries are merged rather than entire map being replaced.
	if _, exists := m["config"]; !exists {
		m["config"] = map[string]any{}
	}
	m["config"].(map[string]any)["headlessTasks"] = c.HeadlessTasks
	m["config"].(map[string]any)["capacity"] = c.Capacity
}

func engineInit() {
	process.Headless = config.HeadlessTasks
}
