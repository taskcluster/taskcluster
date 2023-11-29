//go:build multiuser

package main

import (
	"fmt"
	"log"

	"github.com/taskcluster/taskcluster/v58/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v58/workers/generic-worker/runtime"
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

func unarchive(src, dst, format string) error {
	log.Printf("Granting %v control of %v", taskContext.User.Name, src)
	err := makeFileOrDirReadWritableForUser(false, src, taskContext.User)
	if err != nil {
		return fmt.Errorf("Not able to make source file %v readable for unarchiving: %v", src, err)
	}
	cmd, err := process.NewCommandNoOutputStreams([]string{gwruntime.GenericWorkerBinary(), "unarchive", "--archive-src", src, "--archive-dst", dst, "--archive-format", format}, taskContext.TaskDir, []string{}, taskContext.pd)
	if err != nil {
		return fmt.Errorf("Cannot create process to unarchive %v to %v as task user %v from directory %v: %v", src, dst, taskContext.User.Name, taskContext.TaskDir, err)
	}
	output, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("Cannot unarchive %v to %v as task user %v from directory %v: %v", src, dst, taskContext.User.Name, taskContext.TaskDir, string(output))
	}
	return nil
}
