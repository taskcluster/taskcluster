package main

import (
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/fileutil"
)

// TaskManager manages concurrent task execution and tracks running tasks.
type TaskManager struct {
	sync.RWMutex
	runningTasks map[string]*TaskRun
	capacity     uint8
	wg           sync.WaitGroup
	lastActive   time.Time
}

// NewTaskManager creates a new TaskManager with the given capacity.
func NewTaskManager(capacity uint8) *TaskManager {
	return &TaskManager{
		runningTasks: make(map[string]*TaskRun),
		capacity:     capacity,
		lastActive:   time.Now(),
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
	tm.runningTasks[task.TaskID] = task
	tm.wg.Add(1)
	tm.lastActive = time.Now()
	tm.updateWorkerStatusLocked()
}

// RemoveTask unregisters a task. Must be called when the task goroutine completes.
// Updates the worker status file with remaining running task IDs.
func (tm *TaskManager) RemoveTask(taskID string) {
	tm.Lock()
	defer tm.Unlock()
	if _, exists := tm.runningTasks[taskID]; exists {
		delete(tm.runningTasks, taskID)
		tm.wg.Done()
		tm.lastActive = time.Now()
		tm.updateWorkerStatusLocked()
	}
}

// RunningTaskIDs returns a slice of all currently running task IDs.
func (tm *TaskManager) RunningTaskIDs() []string {
	tm.RLock()
	defer tm.RUnlock()
	ids := make([]string, 0, len(tm.runningTasks))
	for id := range tm.runningTasks {
		ids = append(ids, id)
	}
	return ids
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

// WaitForAll blocks until all running tasks have completed.
func (tm *TaskManager) WaitForAll() {
	tm.wg.Wait()
}

// LastActive returns the time when a task was last added or removed.
func (tm *TaskManager) LastActive() time.Time {
	tm.RLock()
	defer tm.RUnlock()
	return tm.lastActive
}

// GetTask returns the TaskRun for the given task ID, or nil if not found.
func (tm *TaskManager) GetTask(taskID string) *TaskRun {
	tm.RLock()
	defer tm.RUnlock()
	return tm.runningTasks[taskID]
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
	}
	return names
}

// updateWorkerStatusLocked writes the current running task IDs to the worker status file.
// Must be called while holding the lock.
func (tm *TaskManager) updateWorkerStatusLocked() {
	ids := make([]string, 0, len(tm.runningTasks))
	for id := range tm.runningTasks {
		ids = append(ids, id)
	}

	if len(ids) == 0 {
		// No tasks running, remove the status file
		os.Remove(workerStatusPath)
	} else {
		status := &WorkerStatus{
			CurrentTaskIDs: ids,
		}
		_ = fileutil.WriteToFileAsJSON(status, workerStatusPath)
	}
}
