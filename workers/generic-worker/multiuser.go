//go:build multiuser

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster/v68/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v68/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v68/workers/generic-worker/runtime"
)

const (
	engine = "multiuser"
)

var (
	// don't initialise here, because cwd might not yet be initialised
	// instead we set up later in PlatformTaskEnvironmentSetup
	ctuPath string
	ntuPath string
)

func secure(configFile string) {
	if !config.RunTasksAsCurrentUser {
		secureError := fileutil.SecureFiles(configFile)
		exitOnError(CANT_SECURE_CONFIG, secureError, "Not able to secure config file %q", configFile)
	}
}

func PlatformTaskEnvironmentSetup(taskDirName string) (reboot bool) {
	ctuPath = filepath.Join(cwd, "current-task-user.json")
	ntuPath = filepath.Join(cwd, "next-task-user.json")
	log.Printf("Current task user file: %q", ctuPath)
	log.Printf("Next task user file: %q", ntuPath)
	reboot = true
	_, err := os.Stat(ntuPath)
	if err == nil {
		_, err = fileutil.Copy(ctuPath, ntuPath)
		if err != nil {
			panic(err)
		}
		err = fileutil.SecureFiles(ctuPath)
		if err != nil {
			panic(err)
		}
		taskUserCredentials, err := StoredUserCredentials()
		if err != nil {
			panic(err)
		}
		interactiveUsername, err := gwruntime.WaitForLoginCompletion(5 * time.Minute)
		if err != nil {
			panic(err)
		}
		if taskUserCredentials.Name != interactiveUsername {
			panic(fmt.Errorf("interactive username %v does not match task user %v from file %q", interactiveUsername, taskUserCredentials.Name, ntuPath))
		}
		reboot = false
		pd, err := process.NewPlatformData(config.RunTasksAsCurrentUser)
		if err != nil {
			panic(err)
		}

		taskContext = &TaskContext{
			User:    taskUserCredentials,
			TaskDir: filepath.Join(config.TasksDir, interactiveUsername),
			pd:      pd,
		}

		// At this point, we know we have already booted into the new task user, and the user
		// is logged in.
		// Note we don't create task directory before logging in, since
		// if the task directory is also the user profile home, this
		// would mess up the windows logon process.
		err = os.MkdirAll(taskContext.TaskDir, 0777) // note: 0777 is mostly ignored on windows
		if err != nil {
			panic(err)
		}
		// Make sure task user has full control of task directory. Due to
		// https://bugzilla.mozilla.org/show_bug.cgi?id=1439588#c38 we can't
		// assume previous MkdirAll has granted this permission.
		log.Printf("Granting %v control of %v", taskContext.User.Name, taskContext.TaskDir)
		err = makeFileOrDirReadWritableForUser(false, taskContext.TaskDir, taskContext.User)
		if err != nil {
			panic(err)
		}
		if script := config.RunAfterUserCreation; script != "" {
			// See https://bugzil.la/1559210
			// Regardless of whether we are running tasks as current user or
			// not, task initialisation steps should be run as task user.
			pdTaskUser, err := process.TaskUserPlatformData()
			if err != nil {
				panic(err)
			}
			command, err := process.NewCommand([]string{script}, taskContext.TaskDir, nil, pdTaskUser)
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

		// If there is precisely one more task to run, no need to create a
		// future task user, as we already have a task user created for the
		// current task, which we found in the Windows registry settings for
		// auto-logon.
		//
		// This also protects against generic-worker tests creating task users,
		// since in tests we always set NumberOfTasksToRun to 1. We don't want
		// tests to create OS users since the new users can only be used after
		// a reboot and we can't reboot mid-task in a CI test. Therefore we
		// allow the hosting generic-worker to create a single task user for
		// the CI task run, and the tests for the current CI task all use this
		// task user, whose credentials they find in the Windows logon regsitry
		// settings.
		if config.NumberOfTasksToRun == 1 {
			return
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

	nextTaskUser := &gwruntime.OSUser{
		Name:     taskDirName,
		Password: gwruntime.GeneratePassword(),
	}
	err = nextTaskUser.CreateNew(false)
	if err != nil {
		panic(err)
	}
	PreRebootSetup(nextTaskUser)
	// configure worker to auto-login to this newly generated user account
	err = gwruntime.SetAutoLogin(nextTaskUser)
	if err != nil {
		panic(err)
	}
	err = fileutil.WriteToFileAsJSON(nextTaskUser, ntuPath)
	if err != nil {
		panic(err)
	}
	err = fileutil.SecureFiles(ntuPath)
	if err != nil {
		panic(err)
	}
	return
}

// Only return critical errors
func purgeOldTasks() error {
	if !config.CleanUpTaskDirs {
		log.Printf("WARNING: Not purging previous task directories/users since config setting cleanUpTaskDirs is false")
		return nil
	}
	deleteTaskDirs(gwruntime.UserHomeDirectoriesParent(), taskContext.User.Name, gwruntime.AutoLogonUser())
	deleteTaskDirs(config.TasksDir, taskContext.User.Name, gwruntime.AutoLogonUser())
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
	allErrors := []string{}
	for _, username := range userAccounts {
		if strings.HasPrefix(username, "task_") && username != taskContext.User.Name && username != gwruntime.AutoLogonUser() {
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

func StoredUserCredentials() (*gwruntime.OSUser, error) {
	credsFile, err := os.Open(ctuPath)
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

func MkdirAllTaskUser(dir string) error {
	if info, err := os.Stat(dir); err == nil && info.IsDir() {
		file, err := CreateFileAsTaskUser(filepath.Join(dir, slugid.Nice()))
		if err != nil {
			return err
		}
		err = file.Close()
		if err != nil {
			return err
		}
		return os.Remove(file.Name())
	}

	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "create-dir", "--create-dir", dir}, taskContext.TaskDir, []string{}, taskContext.pd)
	if err != nil {
		return fmt.Errorf("cannot create process to create directory %v as task user %v from directory %v: %v", dir, taskContext.User.Name, taskContext.TaskDir, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return fmt.Errorf("cannot create directory %v as task user %v from directory %v: %v", dir, taskContext.User.Name, taskContext.TaskDir, result)
	}
	return nil
}

func CreateFileAsTaskUser(file string) (*os.File, error) {
	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "create-file", "--create-file", file}, taskContext.TaskDir, []string{}, taskContext.pd)
	if err != nil {
		return nil, fmt.Errorf("cannot create process to create file %v as task user %v from directory %v: %v", file, taskContext.User.Name, taskContext.TaskDir, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return nil, fmt.Errorf("cannot create file %v as task user %v from directory %v: %v", file, taskContext.User.Name, taskContext.TaskDir, result)
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
