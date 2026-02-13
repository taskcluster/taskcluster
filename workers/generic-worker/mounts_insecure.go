//go:build insecure

package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v96/workers/generic-worker/runtime"
)

func makeFileReadWritableForTaskUser(taskMount *TaskMount, dir string) error {
	// No user separation
	return nil
}

func makeDirReadWritableForTaskUser(taskMount *TaskMount, dir string) error {
	// No user separation
	return nil
}

func unarchive(source, destination, format string, ctx *TaskContext, pd *process.PlatformData) error {
	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "unarchive", "--archive-src", source, "--archive-dst", destination, "--archive-fmt", format}, "", []string{})
	if err != nil {
		return fmt.Errorf("cannot create process to unarchive %v to %v as task user: %v", source, destination, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return fmt.Errorf("cannot unarchive %v to %v as task user: %v", source, destination, result)
	}
	return nil
}
