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
	// Skip recursive ownership changes for d2g tasks since file ownership
	// inside the container is determined by the container itself (there's
	// no UID mapping). Changing ownership to the host task user would break
	// the container's expectations (e.g., files created as uid=1000 inside
	// the container would become owned by a different UID).
	if taskMount.task.D2GInfo != nil {
		return nil
	}
	return makeReadWritableForTaskUser(taskMount, dir, "directory", true)
}

func makeReadWritableForTaskUser(taskMount *TaskMount, fileOrDirectory string, filetype string, recurse bool) error {
	// It doesn't concern us if payload.features.runTaskAsCurrentUser is set or not
	// because files inside task directory should be owned/managed by task user
	// However, if running as current user, taskMount.task.pd is not set, so use
	// task context's User instead of credentials inside taskMount.task.pd.
	ctx := taskMount.task.GetContext()
	taskMount.Infof("Granting %v full control of %v '%v'", ctx.User.Name, filetype, fileOrDirectory)
	err := makeFileOrDirReadWritableForUser(recurse, fileOrDirectory, ctx.User)
	if err != nil {
		return fmt.Errorf("[mounts] Not able to make %v %v writable for %v: %v", filetype, fileOrDirectory, ctx.User.Name, err)
	}
	return nil
}

func unarchive(source, destination, format string, ctx *TaskContext, pd *process.PlatformData) error {
	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "unarchive", "--archive-src", source, "--archive-dst", destination, "--archive-fmt", format}, ctx.TaskDir, []string{}, pd)
	if err != nil {
		return fmt.Errorf("cannot create process to unarchive %v to %v as task user %v from directory %v: %v", source, destination, ctx.User.Name, ctx.TaskDir, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return fmt.Errorf("cannot unarchive %v to %v as task user %v from directory %v: %v", source, destination, ctx.User.Name, ctx.TaskDir, result)
	}
	return nil
}
