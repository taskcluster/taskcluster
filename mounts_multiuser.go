// +build multiuser

package main

import (
	"fmt"
)

func makeFileReadWritableForTaskUser(task *TaskRun, file string) error {
	return makeReadWritableForTaskUser(task, file, "file", false)
}

func makeDirReadWritableForTaskUser(task *TaskRun, dir string) error {
	return makeReadWritableForTaskUser(task, dir, "directory", true)
}

func makeReadWritableForTaskUser(task *TaskRun, fileOrDirectory string, filetype string, recurse bool) error {
	// It doesn't concern us if config.RunTasksAsCurrentUser is set or not
	// because files inside task directory should be owned/managed by task user
	// However, if running as current user, taskContext.pd is not set, so use
	// taskContext.User.Name instead of credentials inside taskContext.pd.
	task.Infof("[mounts] Granting %v full control of %v '%v'", taskContext.User.Name, filetype, fileOrDirectory)
	output, err := makeFileOrDirReadWritableForUser(recurse, fileOrDirectory, taskContext.User)
	if err != nil {
		return fmt.Errorf("[mounts] Not able to make %v %v writable for %v: %v: %v", filetype, fileOrDirectory, taskContext.User.Name, err, string(output))
	}
	return nil
}

func makeDirUnreadableForTaskUser(task *TaskRun, dir string) error {
	// It doesn't concern us if config.RunTasksAsCurrentUser is set or not
	// because files inside task directory should be owned/managed by task user
	task.Infof("[mounts] Denying %v access to '%v'", taskContext.User.Name, dir)
	output, err := makeDirUnreadableForUser(dir, taskContext.User)
	if err != nil {
		return fmt.Errorf("[mounts] Not able to make root-owned directory %v have permissions 0700 in order to make it unreadable for %v: %v: %v", dir, taskContext.User.Name, err, string(output))
	}
	return nil
}
