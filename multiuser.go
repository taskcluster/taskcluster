// +build multiuser

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

	"github.com/taskcluster/generic-worker/fileutil"
	"github.com/taskcluster/generic-worker/process"
	"github.com/taskcluster/generic-worker/runtime"
)

const (
	engine = "multiuser"
)

func secureConfigFile() {
	if !config.RunTasksAsCurrentUser {
		secureError := fileutil.SecureFiles([]string{configFile})
		exitOnError(CANT_SECURE_CONFIG, secureError, "Not able to secure config file %v", configFile)
	}
}

func PlatformTaskEnvironmentSetup(taskDirName string) (reboot bool) {
	reboot = true
	_, err := os.Stat("next-task-user.json")
	if err == nil {
		_, err = fileutil.Copy("current-task-user.json", "next-task-user.json")
		if err != nil {
			panic(err)
		}
		err = fileutil.SecureFiles([]string{"current-task-user.json"})
		if err != nil {
			panic(err)
		}
		taskUserCredentials, err := StoredUserCredentials()
		if err != nil {
			panic(err)
		}
		err = runtime.WaitForLoginCompletion(5 * time.Minute)
		if err != nil {
			panic(err)
		}
		interactiveUsername, err := runtime.InteractiveUsername()
		if err != nil {
			panic(err)
		}
		if taskUserCredentials.Name != interactiveUsername {
			panic(fmt.Errorf("Interactive username %v does not match task user %v from next-task-user.json file", interactiveUsername, taskUserCredentials.Name))
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
		output, err := makeFileOrDirReadWritableForUser(false, taskContext.TaskDir, taskContext.User)
		log.Printf("Granting %v control of %v: %v", taskContext.User.Name, taskContext.TaskDir, string(output))
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

	nextTaskUser := &runtime.OSUser{
		Name:     taskDirName,
		Password: runtime.GeneratePassword(),
	}
	err = nextTaskUser.CreateNew(false)
	if err != nil {
		panic(err)
	}
	PreRebootSetup(nextTaskUser)
	// configure worker to auto-login to this newly generated user account
	err = runtime.SetAutoLogin(nextTaskUser)
	if err != nil {
		panic(err)
	}
	err = fileutil.WriteToFileAsJSON(nextTaskUser, "next-task-user.json")
	if err != nil {
		panic(err)
	}
	err = fileutil.SecureFiles([]string{"next-task-user.json"})
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
	deleteTaskDirs(runtime.UserHomeDirectoriesParent(), taskContext.User.Name, runtime.AutoLogonCredentials().Name)
	deleteTaskDirs(config.TasksDir, taskContext.User.Name, runtime.AutoLogonCredentials().Name)
	// regardless of whether we are running as current user or not, we should purge old task users
	err := deleteExistingOSUsers()
	if err != nil {
		log.Printf("Could not delete old task users:\n%v", err)
	}
	return nil
}

func deleteExistingOSUsers() (err error) {
	log.Print("Looking for existing task users to delete...")
	userAccounts, err := runtime.ListUserAccounts()
	if err != nil {
		return
	}
	allErrors := []string{}
	for _, username := range userAccounts {
		if strings.HasPrefix(username, "task_") && username != taskContext.User.Name && username != runtime.AutoLogonCredentials().Name {
			log.Print("Attempting to remove user " + username + "...")
			err2 := runtime.DeleteUser(username)
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

func StoredUserCredentials() (*runtime.OSUser, error) {
	credsFile, err := os.Open("current-task-user.json")
	if err != nil {
		return nil, err
	}
	defer func() {
		credsFile.Close()
	}()
	decoder := json.NewDecoder(credsFile)
	decoder.DisallowUnknownFields()
	var user runtime.OSUser
	err = decoder.Decode(&user)
	if err != nil {
		panic(err)
	}
	return &user, nil
}
