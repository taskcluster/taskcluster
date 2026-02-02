//go:build insecure

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/mcuadros/go-defaults"
	"github.com/stretchr/testify/require"
)

// Note we don't want to set config.NumberOfTasksToRun on multiuser engine
// since new OS users would get created, so we limit this test to the insecure
// engine.
func TestNewTaskDirectoryForEachTask(t *testing.T) {
	setup(t)
	origNumberOfTasksToRun := config.NumberOfTasksToRun
	t.Cleanup(func() {
		config.NumberOfTasksToRun = origNumberOfTasksToRun
	})
	config.NumberOfTasksToRun = 3
	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 10,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	for range config.NumberOfTasksToRun {
		_ = scheduleTask(t, td, payload)
	}

	execute(t, TASKS_COMPLETE)

	// scan task directories, to make sure there are three unique backing log files,
	// implying that each task ran in its own directory

	var taskDirs uint = 0
	visitedRootDir := false
	err := filepath.WalkDir(config.TasksDir, func(path string, d os.DirEntry, err error) error {
		// filepath.WalkDir guarantees lexical ordering and therefore, first entry is root directory
		if !visitedRootDir {
			visitedRootDir = true
			return nil
		}
		if !d.IsDir() {
			t.Logf("Found file %v", path)
			return nil
		}
		t.Logf("Found directory %v", path)
		if !strings.HasPrefix(d.Name(), "task_") && d.Name() != "generic-worker" {
			return fmt.Errorf("Discovered directory with name %q but was expecting it to start with `task_`", d.Name())
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

// TestConcurrentTaskExecution verifies that when capacity > 1, tasks run concurrently.
// Each task sleeps for a period and writes a timestamp. If tasks run in parallel,
// total execution time should be approximately equal to one task duration, not the sum.
func TestConcurrentTaskExecution(t *testing.T) {
	setup(t)

	// Save original config values and restore after test
	origCapacity := config.Capacity
	origNumberOfTasksToRun := config.NumberOfTasksToRun
	t.Cleanup(func() {
		config.Capacity = origCapacity
		config.NumberOfTasksToRun = origNumberOfTasksToRun
	})

	// Configure for concurrent execution
	config.Capacity = 2
	config.NumberOfTasksToRun = 2

	// Each task sleeps for 3 seconds
	// If running concurrently, total time should be ~3-4 seconds
	// If running sequentially, total time would be ~6+ seconds
	taskSleepSeconds := uint(3)
	payload := GenericWorkerPayload{
		Command:    sleep(taskSleepSeconds),
		MaxRunTime: 30,
	}
	defaults.SetDefaults(&payload)

	// Schedule 2 tasks
	td1 := testTask(t)
	td2 := testTask(t)
	taskID1 := scheduleTask(t, td1, payload)
	taskID2 := scheduleTask(t, td2, payload)

	t.Logf("Scheduled tasks: %s, %s", taskID1, taskID2)
	t.Logf("Capacity: %d, Each task sleeps for %d seconds", config.Capacity, taskSleepSeconds)

	// Measure execution time
	startTime := time.Now()
	execute(t, TASKS_COMPLETE)
	elapsed := time.Since(startTime)

	t.Logf("Total execution time: %v", elapsed)

	// Verify tasks completed successfully
	queue := serviceFactory.Queue(config.Credentials(), config.RootURL)

	status1, err := queue.Status(taskID1)
	require.NoError(t, err)
	require.Equal(t, "completed", status1.Status.Runs[0].State, "Task 1 should complete successfully")
	require.Equal(t, "completed", status1.Status.Runs[0].ReasonResolved, "Task 1 should resolve as completed")

	status2, err := queue.Status(taskID2)
	require.NoError(t, err)
	require.Equal(t, "completed", status2.Status.Runs[0].State, "Task 2 should complete successfully")
	require.Equal(t, "completed", status2.Status.Runs[0].ReasonResolved, "Task 2 should resolve as completed")

	// Verify concurrent execution by checking timing
	// Allow some overhead (1.5x single task time) but should be much less than sequential (2x)
	maxExpectedDuration := time.Duration(float64(taskSleepSeconds)*1.5) * time.Second
	minSequentialDuration := time.Duration(taskSleepSeconds*2) * time.Second

	t.Logf("Expected max concurrent duration: %v", maxExpectedDuration)
	t.Logf("Sequential duration would be >= %v", minSequentialDuration)

	if elapsed >= minSequentialDuration {
		t.Errorf("Tasks appear to have run sequentially (took %v, expected < %v for concurrent execution)", elapsed, minSequentialDuration)
	}

	// Verify each task ran in its own directory
	taskDirs := 0
	err = filepath.WalkDir(config.TasksDir, func(path string, d os.DirEntry, err error) error {
		if d.IsDir() && strings.HasPrefix(d.Name(), "task_") {
			taskDirs++
			t.Logf("Found task directory: %s", d.Name())
		}
		return nil
	})
	require.NoError(t, err)
	require.Equal(t, 2, taskDirs, "Should have 2 task directories for 2 concurrent tasks")
}

// TestConcurrentTaskPortAllocation verifies that concurrent tasks get different ports.
func TestConcurrentTaskPortAllocation(t *testing.T) {
	setup(t)

	// Save original config values and restore after test
	origCapacity := config.Capacity
	origNumberOfTasksToRun := config.NumberOfTasksToRun
	t.Cleanup(func() {
		config.Capacity = origCapacity
		config.NumberOfTasksToRun = origNumberOfTasksToRun
	})

	config.Capacity = 2
	config.NumberOfTasksToRun = 2

	// These tasks will use TaskclusterProxy (different ports per task)
	// The task prints the TASKCLUSTER_PROXY_URL environment variable
	// Sleep ensures tasks overlap for concurrent port allocation testing
	payload := GenericWorkerPayload{
		Command:    append(printEnvVar("TASKCLUSTER_PROXY_URL"), sleep(2)...),
		MaxRunTime: 30,
		Features: FeatureFlags{
			TaskclusterProxy: true,
		},
	}
	defaults.SetDefaults(&payload)

	td1 := testTask(t)
	td1.Scopes = []string{"queue:get-artifact:*"}
	td2 := testTask(t)
	td2.Scopes = []string{"queue:get-artifact:*"}

	taskID1 := scheduleTask(t, td1, payload)
	taskID2 := scheduleTask(t, td2, payload)

	t.Logf("Scheduled tasks with TaskclusterProxy: %s, %s", taskID1, taskID2)

	execute(t, TASKS_COMPLETE)

	// Verify both tasks completed
	queue := serviceFactory.Queue(config.Credentials(), config.RootURL)

	status1, err := queue.Status(taskID1)
	require.NoError(t, err)
	require.Equal(t, "completed", status1.Status.Runs[0].State)

	status2, err := queue.Status(taskID2)
	require.NoError(t, err)
	require.Equal(t, "completed", status2.Status.Runs[0].State)

	// Read task logs to verify different proxy ports were used
	// The port manager allocates ports with offset: slot * 4
	// So task on slot 0 gets proxyPort, task on slot 1 gets proxyPort + 4

	// Find task directories and read their logs
	var proxyPorts []int
	err = filepath.WalkDir(config.TasksDir, func(path string, d os.DirEntry, err error) error {
		if !d.IsDir() && d.Name() == "live_backing.log" {
			content, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			// Parse TASKCLUSTER_PROXY_URL from log
			for line := range strings.SplitSeq(string(content), "\n") {
				if urlPart, ok := strings.CutPrefix(line, "TASKCLUSTER_PROXY_URL="); ok {
					// Format: TASKCLUSTER_PROXY_URL=http://localhost:PORT
					// Extract port from URL
					parts := strings.Split(urlPart, ":")
					if len(parts) >= 3 {
						portStr := strings.TrimRight(parts[2], "/")
						port, _ := strconv.Atoi(portStr)
						if port > 0 {
							proxyPorts = append(proxyPorts, port)
							t.Logf("Found proxy port %d in %s", port, path)
						}
					}
				}
			}
		}
		return nil
	})
	require.NoError(t, err)

	// Verify we found 2 different ports
	require.Len(t, proxyPorts, 2, "Should find 2 proxy port assignments")
	require.NotEqual(t, proxyPorts[0], proxyPorts[1], "Concurrent tasks should have different proxy ports")
	t.Logf("Task proxy ports: %v and %v", proxyPorts[0], proxyPorts[1])
}
