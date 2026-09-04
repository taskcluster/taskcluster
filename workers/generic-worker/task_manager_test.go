package main

import (
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestTaskManagerCapacity(t *testing.T) {
	tm := NewTaskManager(3)
	require.Equal(t, uint(3), tm.AvailableCapacity())
	require.True(t, tm.IsIdle())

	// Add a task
	task1 := &TaskRun{TaskID: "task1"}
	tm.AddTask(task1)
	require.Equal(t, uint(2), tm.AvailableCapacity())
	require.Equal(t, uint(1), tm.TaskCount())
	require.False(t, tm.IsIdle())

	// Add more tasks
	task2 := &TaskRun{TaskID: "task2"}
	task3 := &TaskRun{TaskID: "task3"}
	tm.AddTask(task2)
	tm.AddTask(task3)
	require.Equal(t, uint(0), tm.AvailableCapacity())
	require.Equal(t, uint(3), tm.TaskCount())

	// Remove a task
	tm.RemoveTask("task2")
	require.Equal(t, uint(1), tm.AvailableCapacity())
	require.Equal(t, uint(2), tm.TaskCount())

	// Remove remaining tasks
	tm.RemoveTask("task1")
	tm.RemoveTask("task3")
	require.Equal(t, uint(3), tm.AvailableCapacity())
	require.True(t, tm.IsIdle())
}

func TestTaskManagerRunningTaskIDs(t *testing.T) {
	tm := NewTaskManager(5)

	task1 := &TaskRun{TaskID: "task1"}
	task2 := &TaskRun{TaskID: "task2"}
	tm.AddTask(task1)
	tm.AddTask(task2)

	ids := tm.RunningTaskIDs()
	require.Len(t, ids, 2)
	require.Contains(t, ids, "task1")
	require.Contains(t, ids, "task2")
}

func TestTaskManagerGetTask(t *testing.T) {
	tm := NewTaskManager(2)

	task1 := &TaskRun{TaskID: "task1"}
	tm.AddTask(task1)

	require.Equal(t, task1, tm.GetTask("task1"))
	require.Nil(t, tm.GetTask("nonexistent"))
}

func TestTaskManagerLastActive(t *testing.T) {
	tm := NewTaskManager(2)
	initialTime := tm.LastActive()

	time.Sleep(5 * time.Millisecond)
	task := &TaskRun{TaskID: "task1"}
	tm.AddTask(task)
	afterAdd := tm.LastActive()
	require.True(t, afterAdd.After(initialTime))

	time.Sleep(5 * time.Millisecond)
	tm.RemoveTask("task1")
	afterRemove := tm.LastActive()
	require.True(t, afterRemove.After(afterAdd))
}

func TestTaskManagerWaitForAll(t *testing.T) {
	origPath := workerStatusPath
	workerStatusPath = filepath.Join(t.TempDir(), "worker-status.json")
	t.Cleanup(func() { workerStatusPath = origPath })

	tm := NewTaskManager(2)
	tm.AddTask(&TaskRun{TaskID: "task1"})
	tm.AddTask(&TaskRun{TaskID: "task2"})

	completions := make(chan taskCompletionResult, 2)
	completions <- taskCompletionResult{taskID: "task1"}
	completions <- taskCompletionResult{taskID: "task2"}

	var applied []string
	tm.WaitForAll(completions, func(result taskCompletionResult) {
		tm.RemoveTask(result.taskID)
		applied = append(applied, result.taskID)
	})

	require.True(t, tm.IsIdle())
	require.ElementsMatch(t, []string{"task1", "task2"}, applied)
	require.NoFileExists(t, workerStatusPath)
}

func TestTaskManagerWaitForAllIdle(t *testing.T) {
	tm := NewTaskManager(1)
	// Unbuffered: receiving would deadlock if we waited while already idle.
	completions := make(chan taskCompletionResult)
	tm.WaitForAll(completions, func(taskCompletionResult) {
		t.Fatal("should not receive when idle")
	})
}

func TestTaskManagerWaitForAllUnregisteredCompletions(t *testing.T) {
	tm := NewTaskManager(1)
	tm.AddTask(&TaskRun{TaskID: "task1"})

	completions := make(chan taskCompletionResult, 2)
	completions <- taskCompletionResult{taskID: "setup-failure"}
	completions <- taskCompletionResult{taskID: "task1"}

	var applied []string
	tm.WaitForAll(completions, func(result taskCompletionResult) {
		tm.RemoveTask(result.taskID)
		applied = append(applied, result.taskID)
	})

	require.True(t, tm.IsIdle())
	require.Equal(t, []string{"setup-failure", "task1"}, applied)
}

func TestTaskManagerConcurrentAccess(t *testing.T) {
	tm := NewTaskManager(100)

	var wg sync.WaitGroup
	// Spawn 50 goroutines adding tasks
	for i := range 50 {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			task := &TaskRun{TaskID: fmt.Sprintf("task-%d", id)}
			tm.AddTask(task)
			time.Sleep(time.Millisecond)
			tm.RemoveTask(task.TaskID)
		}(i)
	}
	wg.Wait()

	require.True(t, tm.IsIdle())
}
