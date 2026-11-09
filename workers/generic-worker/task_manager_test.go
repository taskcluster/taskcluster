package main

import (
	"fmt"
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
	tm.RemoveTask("task2", 0)
	require.Equal(t, uint(1), tm.AvailableCapacity())
	require.Equal(t, uint(2), tm.TaskCount())

	// Remove remaining tasks
	tm.RemoveTask("task1", 0)
	tm.RemoveTask("task3", 0)
	require.Equal(t, uint(3), tm.AvailableCapacity())
	require.True(t, tm.IsIdle())
}

func TestTaskManagerConcurrentAccess(t *testing.T) {
	tm := NewTaskManager(100)

	var wg sync.WaitGroup
	// Spawn 50 goroutines adding tasks
	for i := range 50 {
		wg.Go(func() {
			task := &TaskRun{TaskID: fmt.Sprintf("task-%d", i)}
			tm.AddTask(task)
			time.Sleep(time.Millisecond)
			tm.RemoveTask(task.TaskID, task.RunID)
		})
	}
	wg.Wait()

	require.True(t, tm.IsIdle())
}

func TestTaskManagerTracksRunsOfSameTaskSeparately(t *testing.T) {
	tm := NewTaskManager(2)

	run0 := &TaskRun{TaskID: "task1", RunID: 0, Context: &TaskContext{TaskDir: "/tasks/task_task1_0"}}
	run1 := &TaskRun{TaskID: "task1", RunID: 1, Context: &TaskContext{TaskDir: "/tasks/task_task1_1"}}
	tm.AddTask(run0)
	tm.AddTask(run1)
	require.Equal(t, uint(2), tm.TaskCount())
	require.Equal(t, uint(0), tm.AvailableCapacity())

	tm.RemoveTask("task1", 0)
	require.Equal(t, uint(1), tm.TaskCount())
	require.Equal(t, []string{"task_task1_1"}, tm.RunningTaskDirNames())
}
