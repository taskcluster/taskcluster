//go:build simple

package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v58/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v58/workers/generic-worker/runtime"
)

func makeFileReadWritableForTaskUser(taskMount *TaskMount, dir string) error {
	// No user separation
	return nil
}

func makeDirReadWritableForTaskUser(taskMount *TaskMount, dir string) error {
	// No user separation
	return nil
}

func makeDirUnreadableForTaskUser(taskMount *TaskMount, dir string) error {
	// No user separation
	return nil
}

func unarchive(src, dst, format string) error {
	cmd, err := process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "unarchive", "--archive-src", src, "--archive-dst", dst, "--archive-format", format}, taskContext.TaskDir, []string{})
	if err != nil {
		return fmt.Errorf("Cannot create process to unarchive %v to %v from directory %v: %v", src, dst, taskContext.TaskDir, err)
	}
	output, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("Cannot unarchive %v to %v from directory %v: %v", src, dst, taskContext.TaskDir, string(output))
	}
	return nil
}
