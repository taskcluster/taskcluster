//go:build simple

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
)

// Note we don't want to set config.NumberOfTasksToRun on multiuser engine
// since new OS users would get created, so we limit this test to the simple
// engine.
func TestNewTaskDirectoryForEachTask(t *testing.T) {
	setup(t)
	config.NumberOfTasksToRun = 3
	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 10,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	for i := uint(0); i < config.NumberOfTasksToRun; i++ {
		_ = scheduleTask(t, td, payload)
	}

	execute(t, TASKS_COMPLETE)

	// scan task directories, to make sure there are three unique backing log files,
	// implying that each task ran in its own directory

	var taskDirs uint = 0
	visitedRootDir := false
	err := filepath.Walk(config.TasksDir, func(path string, info os.FileInfo, err error) error {
		// filepath.Walk guarantees lexical ordering and therefore, first entry is root directory
		if !visitedRootDir {
			visitedRootDir = true
			return nil
		}
		if !info.IsDir() {
			t.Logf("Found file %v", path)
			return nil
		}
		t.Logf("Found directory %v", path)
		if !strings.HasPrefix(info.Name(), "task_") && info.Name() != "generic-worker" {
			return fmt.Errorf("Discovered directory with name %q but was expecting it to start with `task_`", info.Name())
		}
		taskDirs++
		return nil
	})
	if err != nil {
		t.Fatalf("%v", err)
	}
	if taskDirs != config.NumberOfTasksToRun*2 {
		t.Fatalf("Expected to find %v directories in total, but found %v", config.NumberOfTasksToRun*2, taskDirs)
	}
}
