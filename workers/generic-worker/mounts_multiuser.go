//go:build multiuser

package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v96/workers/generic-worker/runtime"
)

func makeFileReadWritableForTaskUser(taskMount *TaskMount, file string) error {
	return makeReadWritableForTaskUser(taskMount, file, "file", false)
}

func makeDirReadWritableForTaskUser(taskMount *TaskMount, dir string) error {
	return makeReadWritableForTaskUser(taskMount, dir, "directory", true)
}

func exchangeDirectoryOwnership(taskMount *TaskMount, dir string, cache *Cache) error {
	// Skip ownership changes for d2g tasks since the ownership of files is decided
	// by the container itself (there's no mapping)
	if taskMount.task.D2GInfo != nil {
		return nil
	}

	// It doesn't concern us if payload.features.runTaskAsCurrentUser is set or not
	// because files inside task directory should be owned/managed by task user
	newOwnerUsername := taskMount.task.User.Name
	newOwnerUID, err := taskMount.task.User.ID()
	if err != nil {
		panic(fmt.Errorf("[mounts] Not able to look up UID for user %v: %w", taskMount.task.User.Name, err))
	}
	taskMount.Infof("Updating ownership of files inside directory '%v' from %v to %v", dir, cache.OwnerUsername, newOwnerUsername)
	err = changeOwnershipInDir(dir, newOwnerUsername, cache)
	if err != nil {
		return fmt.Errorf("[mounts] Not able to update ownership of directory %v from %v (UID %v) to %v (UID %v): %w", dir, cache.OwnerUsername, cache.OwnerUID, newOwnerUsername, newOwnerUID, err)
	}
	// now set the OwnerUID to the current task user UID, so that the next
	// time this cache is mounted, the UID find/replace will replace the
	// current task user with the next task user that uses it
	cache.OwnerUsername = newOwnerUsername
	cache.OwnerUID = newOwnerUID
	return nil
}

func makeReadWritableForTaskUser(taskMount *TaskMount, fileOrDirectory string, filetype string, recurse bool) error {
	// It doesn't concern us if payload.features.runTaskAsCurrentUser is set or not
	// because files inside task directory should be owned/managed by task user
	// However, if running as current user, taskMount.task.pd is not set, so use
	// task.User.Name instead of credentials inside taskMount.task.pd.
	taskMount.Infof("Granting %v full control of %v '%v'", taskMount.task.User.Name, filetype, fileOrDirectory)
	err := makeFileOrDirReadWritableForUser(recurse, fileOrDirectory, taskMount.task.User)
	if err != nil {
		return fmt.Errorf("[mounts] Not able to make %v %v writable for %v: %v", filetype, fileOrDirectory, taskMount.task.User.Name, err)
	}
	return nil
}

func unarchive(source, destination, format string, task *TaskRun) error {
	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "unarchive", "--archive-src", source, "--archive-dst", destination, "--archive-fmt", format}, task.TaskDir, []string{}, task.pd)
	if err != nil {
		return fmt.Errorf("cannot create process to unarchive %v to %v as task user %v from directory %v: %v", source, destination, task.User.Name, task.TaskDir, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return fmt.Errorf("cannot unarchive %v to %v as task user %v from directory %v: %v", source, destination, task.User.Name, task.TaskDir, result)
	}
	return nil
}
