package main

import (
	"log"
	"os"
	"path/filepath"
	"strconv"
	"sync"

	"github.com/taskcluster/taskcluster/v115/workers/generic-worker/fileutil"
)

// TaskManager manages concurrent task execution and tracks running tasks.
type TaskManager struct {
	sync.RWMutex
	runningTasks map[string]*TaskRun // taskRunKey -> task run
	capacity     uint8
}

// NewTaskManager creates a new TaskManager with the given capacity.
func NewTaskManager(capacity uint8) *TaskManager {
	return &TaskManager{
		runningTasks: make(map[string]*TaskRun),
		capacity:     capacity,
	}
}

// AvailableCapacity returns the number of additional tasks that can be run.
func (tm *TaskManager) AvailableCapacity() uint {
	tm.RLock()
	defer tm.RUnlock()
	running := uint(len(tm.runningTasks))
	capacity := uint(tm.capacity)
	if running >= capacity {
		return 0
	}
	return capacity - running
}

// AddTask registers a task as running. Must be called before starting the task goroutine.
// Updates the worker status file with all running task IDs.
func (tm *TaskManager) AddTask(task *TaskRun) {
	tm.Lock()
	defer tm.Unlock()
	tm.runningTasks[taskRunKey(task.TaskID, task.RunID)] = task
	tm.updateWorkerStatusLocked()
}

// RemoveTask unregisters the given run of a task.
// Updates the worker status file with remaining running task IDs.
func (tm *TaskManager) RemoveTask(taskID string, runID uint) {
	key := taskRunKey(taskID, runID)
	tm.Lock()
	defer tm.Unlock()
	if _, exists := tm.runningTasks[key]; exists {
		delete(tm.runningTasks, key)
		tm.updateWorkerStatusLocked()
	}
}

// TaskCount returns the number of currently running tasks.
func (tm *TaskManager) TaskCount() uint {
	tm.RLock()
	defer tm.RUnlock()
	return uint(len(tm.runningTasks))
}

// IsIdle returns true if no tasks are running.
func (tm *TaskManager) IsIdle() bool {
	return tm.TaskCount() == 0
}

// RunningTaskDirNames returns the base names of all running task directories.
// This is used to skip these directories during cleanup.
func (tm *TaskManager) RunningTaskDirNames() []string {
	tm.RLock()
	defer tm.RUnlock()
	names := make([]string, 0, len(tm.runningTasks))
	for _, task := range tm.runningTasks {
		if task.Context != nil && task.Context.TaskDir != "" {
			names = append(names, filepath.Base(task.Context.TaskDir))
		}
		if task.Context != nil && task.Context.ReservedArtifactsDir != "" {
			names = append(names, filepath.Base(task.Context.ReservedArtifactsDir))
		}
	}
	return names
}

// updateWorkerStatusLocked writes the current running task IDs to the worker status file.
// Must be called while holding the lock.
func (tm *TaskManager) updateWorkerStatusLocked() {
	ids := make([]string, 0, len(tm.runningTasks))
	for _, task := range tm.runningTasks {
		ids = append(ids, task.TaskID)
	}

	if len(ids) == 0 {
		// No tasks running, remove the status file
		if err := os.Remove(workerStatusPath); err != nil && !os.IsNotExist(err) {
			log.Printf("WARNING: could not remove worker status file: %v", err)
		}
	} else {
		status := &WorkerStatus{
			CurrentTaskIDs: ids,
		}
		if err := fileutil.WriteToFileAsJSON(status, workerStatusPath); err != nil {
			log.Printf("WARNING: could not write worker status file: %v", err)
		}
	}
}

func taskRunKey(taskID string, runID uint) string {
	return taskID + "/" + strconv.FormatUint(uint64(runID), 10)
}
