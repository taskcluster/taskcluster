//go:build multiuser

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"slices"
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

var (
	// ctuPath is the path to the current-task-user.json file, used by
	// run-task-as-current-user features to expose credentials to tasks.
	// Initialized in engineInit().
	ctuPath      string
	runningTests bool = false
)

func secure(configFile string) {
	secureError := fileutil.SecureFiles(configFile)
	exitOnError(CANT_SECURE_CONFIG, secureError, "Not able to secure config file %q", configFile)
}

func rebootBetweenTasks() bool {
	return !config.HeadlessTasks
}

// Only return critical errors
func purgeOldTasks() error {
	if !config.CleanUpTaskDirs {
		log.Printf("WARNING: Not purging previous task directories/users since config setting cleanUpTaskDirs is false")
		return nil
	}
	activeUserNames := pool.ActiveUserNames()
	activeDirNames := pool.ActiveTaskDirNames()
	deleteTaskDirs(gwruntime.UserHomeDirectoriesParent(), activeUserNames...)
	deleteTaskDirs(config.TasksDir, activeDirNames...)
	// regardless of whether we are running as current user or not, we should purge old task users
	err := deleteExistingOSUsers()
	if err != nil {
		log.Printf("Could not delete old task users:\n%v", err)
	}
	return nil
}

func deleteExistingOSUsers() (err error) {
	log.Print("Looking for existing task users to delete...")
	userAccounts, err := gwruntime.ListUserAccounts()
	if err != nil {
		return
	}
	activeUsers := pool.ActiveUserNames()
	allErrors := []string{}
	for _, username := range userAccounts {
		if strings.HasPrefix(username, "task_") && !slices.Contains(activeUsers, username) {
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

func MkdirAllTaskUser(dir string, task *TaskRun) error {
	if info, err := os.Stat(dir); err == nil && info.IsDir() {
		file, err := CreateFileAsTaskUser(filepath.Join(dir, slugid.Nice()), task)
		if err != nil {
			return err
		}
		err = file.Close()
		if err != nil {
			return err
		}
		return os.Remove(file.Name())
	}

	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "create-dir", "--create-dir", dir}, task.TaskDir, []string{}, task.pd)
	if err != nil {
		return fmt.Errorf("cannot create process to create directory %v as task user %v from directory %v: %v", dir, task.User.Name, task.TaskDir, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return fmt.Errorf("cannot create directory %v as task user %v from directory %v: %v", dir, task.User.Name, task.TaskDir, result)
	}
	return nil
}

func CreateFileAsTaskUser(file string, task *TaskRun) (*os.File, error) {
	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "create-file", "--create-file", file}, task.TaskDir, []string{}, task.pd)
	if err != nil {
		return nil, fmt.Errorf("cannot create process to create file %v as task user %v from directory %v: %v", file, task.User.Name, task.TaskDir, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return nil, fmt.Errorf("cannot create file %v as task user %v from directory %v: %v", file, task.User.Name, task.TaskDir, result)
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
	ctuPath = filepath.Join(cwd, "current-task-user.json")
}

// MultiuserTestProvisioner creates task environments during test runs.
// It reads stored credentials from next-task-user.json.
type MultiuserTestProvisioner struct{}

func (p *MultiuserTestProvisioner) Provision() (*TaskEnvironment, bool, error) {
	taskUser, err := StoredUserCredentials(filepath.Join(cwd, "next-task-user.json"))
	if err != nil {
		return nil, false, err
	}
	taskDir := filepath.Join(config.TasksDir, taskUser.Name)
	err = os.MkdirAll(taskDir, 0777)
	if err != nil {
		return nil, false, err
	}
	log.Printf("Granting %v control of %v", taskUser.Name, taskDir)
	err = makeFileOrDirReadWritableForUser(false, taskDir, taskUser)
	if err != nil {
		return nil, false, err
	}
	if script := config.RunAfterUserCreation; script != "" {
		pdTaskUser, err := process.TaskUserPlatformData(taskUser, config.HeadlessTasks)
		if err != nil {
			return nil, false, err
		}
		command, err := process.NewCommand([]string{script}, taskDir, nil, pdTaskUser)
		if err != nil {
			return nil, false, err
		}
		command.DirectOutput(os.Stdout)
		result := command.Execute()
		log.Printf("%v", result)
		switch {
		case result.Failed():
			return nil, false, result.FailureCause()
		case result.Crashed():
			return nil, false, result.CrashCause()
		}
	}
	logDir := filepath.Join(taskDir, filepath.Dir(logPath))
	err = os.MkdirAll(logDir, 0700)
	if err != nil {
		return nil, false, err
	}
	log.Printf("Created dir: %v", logDir)
	pd, err := process.TaskUserPlatformData(taskUser, config.HeadlessTasks)
	if err != nil {
		return nil, false, err
	}
	return &TaskEnvironment{
		TaskDir:      taskDir,
		User:         taskUser,
		PlatformData: pd,
	}, false, nil
}

// MultiuserHeadlessProvisioner creates task environments for headless
// multiuser execution. It creates a new OS user for each task but does
// not require a reboot.
type MultiuserHeadlessProvisioner struct{}

func (p *MultiuserHeadlessProvisioner) Provision() (*TaskEnvironment, bool, error) {
	taskDirName := fmt.Sprintf("task_%v", time.Now().UnixNano())[:20]
	taskUser := &gwruntime.OSUser{
		Name:     taskDirName,
		Password: gwruntime.GeneratePassword(),
	}
	err := taskUser.CreateNew(false)
	if err != nil {
		return nil, false, err
	}
	PreRebootSetup(taskUser)
	taskDir := filepath.Join(config.TasksDir, taskUser.Name)
	err = os.MkdirAll(taskDir, 0777)
	if err != nil {
		return nil, false, err
	}
	log.Printf("Granting %v control of %v", taskUser.Name, taskDir)
	err = makeFileOrDirReadWritableForUser(false, taskDir, taskUser)
	if err != nil {
		return nil, false, err
	}
	if script := config.RunAfterUserCreation; script != "" {
		pdTaskUser, err := process.TaskUserPlatformData(taskUser, config.HeadlessTasks)
		if err != nil {
			return nil, false, err
		}
		command, err := process.NewCommand([]string{script}, taskDir, nil, pdTaskUser)
		if err != nil {
			return nil, false, err
		}
		command.DirectOutput(os.Stdout)
		result := command.Execute()
		log.Printf("%v", result)
		switch {
		case result.Failed():
			return nil, false, result.FailureCause()
		case result.Crashed():
			return nil, false, result.CrashCause()
		}
	}
	logDir := filepath.Join(taskDir, filepath.Dir(logPath))
	err = os.MkdirAll(logDir, 0700)
	if err != nil {
		return nil, false, err
	}
	log.Printf("Created dir: %v", logDir)
	pd, err := process.TaskUserPlatformData(taskUser, config.HeadlessTasks)
	if err != nil {
		return nil, false, err
	}
	return &TaskEnvironment{
		TaskDir:      taskDir,
		User:         taskUser,
		PlatformData: pd,
	}, false, nil
}

// MultiuserNonHeadlessProvisioner creates task environments for
// non-headless multiuser execution. This involves the reboot state
// machine: first call creates a user and triggers reboot, second
// call (after reboot) completes setup with the logged-in user.
type MultiuserNonHeadlessProvisioner struct{}

func (p *MultiuserNonHeadlessProvisioner) Provision() (*TaskEnvironment, bool, error) {
	localCtuPath := filepath.Join(cwd, "current-task-user.json")
	localNtuPath := filepath.Join(cwd, "next-task-user.json")

	_, err := os.Stat(localNtuPath)
	if err == nil {
		// Post-reboot path: next-task-user.json exists
		_, err = fileutil.Copy(localCtuPath, localNtuPath)
		if err != nil {
			return nil, false, err
		}
		err = fileutil.SecureFiles(localCtuPath)
		if err != nil {
			return nil, false, err
		}
		taskUserCredentials, err := StoredUserCredentials(localCtuPath)
		if err != nil {
			return nil, false, err
		}
		err = gwruntime.WaitForLoginCompletion(5*time.Minute, taskUserCredentials.Name)
		if err != nil {
			return nil, false, err
		}

		// PostRebootSetup logic inline
		taskDir := filepath.Join(config.TasksDir, taskUserCredentials.Name)
		err = os.MkdirAll(taskDir, 0777)
		if err != nil {
			return nil, false, err
		}
		log.Printf("Granting %v control of %v", taskUserCredentials.Name, taskDir)
		err = makeFileOrDirReadWritableForUser(false, taskDir, taskUserCredentials)
		if err != nil {
			return nil, false, err
		}
		if script := config.RunAfterUserCreation; script != "" {
			pdTaskUser, err := process.TaskUserPlatformData(taskUserCredentials, config.HeadlessTasks)
			if err != nil {
				return nil, false, err
			}
			command, err := process.NewCommand([]string{script}, taskDir, nil, pdTaskUser)
			if err != nil {
				return nil, false, err
			}
			command.DirectOutput(os.Stdout)
			result := command.Execute()
			log.Printf("%v", result)
			switch {
			case result.Failed():
				return nil, false, result.FailureCause()
			case result.Crashed():
				return nil, false, result.CrashCause()
			}
		}
		logDir := filepath.Join(taskDir, filepath.Dir(logPath))
		err = os.MkdirAll(logDir, 0700)
		if err != nil {
			return nil, false, err
		}
		log.Printf("Created dir: %v", logDir)
		pd, err := process.TaskUserPlatformData(taskUserCredentials, config.HeadlessTasks)
		if err != nil {
			return nil, false, err
		}
		env := &TaskEnvironment{
			TaskDir:      taskDir,
			User:         taskUserCredentials,
			PlatformData: pd,
		}

		// If there is precisely one more task to run, no need to create a
		// future (post-reboot) task user.
		if config.NumberOfTasksToRun == 1 {
			return env, false, nil
		}

		// Pre-provision next user for after reboot (Bug 1533694)
		p.prepareNextUser(localNtuPath)

		return env, false, nil
	}

	// Pre-reboot path: no next-task-user.json yet, create user and reboot
	p.prepareNextUser(localNtuPath)
	return nil, true, nil
}

func (p *MultiuserNonHeadlessProvisioner) prepareNextUser(ntuPath string) {
	taskDirName := fmt.Sprintf("task_%v", time.Now().UnixNano())[:20]
	nextUser := &gwruntime.OSUser{
		Name:     taskDirName,
		Password: gwruntime.GeneratePassword(),
	}
	err := nextUser.CreateNew(false)
	if err != nil {
		panic(err)
	}
	PreRebootSetup(nextUser)
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
}

func newProvisioner() TaskEnvironmentProvisioner {
	if runningTests {
		return &MultiuserTestProvisioner{}
	}
	if config.HeadlessTasks {
		return &MultiuserHeadlessProvisioner{}
	}
	return &MultiuserNonHeadlessProvisioner{}
}
