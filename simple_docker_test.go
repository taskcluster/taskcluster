// +build simple docker

package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"testing"
)

// Note we don't want to set config.NumberOfTasksToRun on multiuser engine
// since new OS users would get created, so we limit this test to simple and
// docker engines.
func TestNewTaskDirectoryForEachTask(t *testing.T) {
	defer setup(t)()
	config.NumberOfTasksToRun = 3
	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 10,
	}
	td := testTask(t)
	for i := uint(0); i < config.NumberOfTasksToRun; i++ {
		_ = scheduleTask(t, td, payload)
	}

	execute(t, TASKS_COMPLETE)

	// scan task directories, to make sure there are three unique backing log files,
	// implying that each task ran in its own directory

	var backingLogsFound uint = 0
	err := filepath.Walk(config.TasksDir, func(path string, info os.FileInfo, err error) error {
		if info.IsDir() {
			return nil
		}
		if info.Name() != "live_backing.log" {
			return fmt.Errorf("Discovered file %q but was expecting %q", info.Name(), "live_backing.log")
		}
		backingLogsFound++
		return nil
	})
	if err != nil {
		log.Fatal(err)
	}
	if backingLogsFound != config.NumberOfTasksToRun {
		log.Fatalf("Expected to find %v backing logs, but found %v", config.NumberOfTasksToRun, backingLogsFound)
	}
}
