//go:build multiuser

package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v68/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v68/workers/generic-worker/runtime"
)

func makeFileReadWritableForTaskUser(taskMount *TaskMount, file string) error {
	return makeReadWritableForTaskUser(taskMount, file, "file", false)
}

func makeDirReadWritableForTaskUser(taskMount *TaskMount, dir string) error {
	return makeReadWritableForTaskUser(taskMount, dir, "directory", true)
}

func makeReadWritableForTaskUser(taskMount *TaskMount, fileOrDirectory string, filetype string, recurse bool) error {
	// It doesn't concern us if config.RunTasksAsCurrentUser is set or not
	// because files inside task directory should be owned/managed by task user
	// However, if running as current user, taskContext.pd is not set, so use
	// taskContext.User.Name instead of credentials inside taskContext.pd.
	taskMount.Infof("Granting %v full control of %v '%v'", taskContext.User.Name, filetype, fileOrDirectory)
	err := makeFileOrDirReadWritableForUser(recurse, fileOrDirectory, taskContext.User)
	if err != nil {
		return fmt.Errorf("[mounts] Not able to make %v %v writable for %v: %v", filetype, fileOrDirectory, taskContext.User.Name, err)
	}
	return nil
}

func makeDirUnreadableForTaskUser(taskMount *TaskMount, dir string) error {
	// It doesn't concern us if config.RunTasksAsCurrentUser is set or not
	// because files inside task directory should be owned/managed by task user
	taskMount.Infof("Denying %v access to '%v'", taskContext.User.Name, dir)
	err := makeDirUnreadableForUser(dir, taskContext.User)
	if err != nil {
		return fmt.Errorf("[mounts] Not able to make root-owned directory %v have permissions 0700 in order to make it unreadable for %v: %v", dir, taskContext.User.Name, err)
	}
	return nil
}

func unarchive(source, destination, format string) error {
	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "unarchive", "--archive-src", source, "--archive-dst", destination, "--archive-fmt", format}, taskContext.TaskDir, []string{}, taskContext.pd)
	if err != nil {
		return fmt.Errorf("cannot create process to unarchive %v to %v as task user %v from directory %v: %v", source, destination, taskContext.User.Name, taskContext.TaskDir, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return fmt.Errorf("cannot unarchive %v to %v as task user %v from directory %v: %v", source, destination, taskContext.User.Name, taskContext.TaskDir, result)
	}
	return nil
}
