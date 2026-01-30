package main

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestTaskManagerCapacity(t *testing.T) {
	tm := NewTaskManager(3)
	require.Equal(t, 3, tm.AvailableCapacity())
	require.True(t, tm.IsIdle())

	// Add a task
	task1 := &TaskRun{TaskID: "task1"}
	tm.AddTask(task1)
	require.Equal(t, 2, tm.AvailableCapacity())
	require.Equal(t, 1, tm.TaskCount())
	require.False(t, tm.IsIdle())

	// Add more tasks
	task2 := &TaskRun{TaskID: "task2"}
	task3 := &TaskRun{TaskID: "task3"}
	tm.AddTask(task2)
	tm.AddTask(task3)
	require.Equal(t, 0, tm.AvailableCapacity())
	require.Equal(t, 3, tm.TaskCount())

	// Remove a task
	tm.RemoveTask("task2")
	require.Equal(t, 1, tm.AvailableCapacity())
	require.Equal(t, 2, tm.TaskCount())

	// Remove remaining tasks
	tm.RemoveTask("task1")
	tm.RemoveTask("task3")
	require.Equal(t, 3, tm.AvailableCapacity())
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

func TestTaskManagerWaitForAll(t *testing.T) {
	tm := NewTaskManager(2)

	var wg sync.WaitGroup
	wg.Add(2)

	task1 := &TaskRun{TaskID: "task1"}
	task2 := &TaskRun{TaskID: "task2"}
	tm.AddTask(task1)
	tm.AddTask(task2)

	// Simulate tasks completing
	go func() {
		time.Sleep(10 * time.Millisecond)
		tm.RemoveTask("task1")
		wg.Done()
	}()
	go func() {
		time.Sleep(20 * time.Millisecond)
		tm.RemoveTask("task2")
		wg.Done()
	}()

	// WaitForAll should block until all tasks complete
	done := make(chan struct{})
	go func() {
		tm.WaitForAll()
		close(done)
	}()

	select {
	case <-done:
		// Success
	case <-time.After(1 * time.Second):
		t.Fatal("WaitForAll timed out")
	}

	require.True(t, tm.IsIdle())
	wg.Wait()
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

func TestTaskManagerConcurrentAccess(t *testing.T) {
	tm := NewTaskManager(100)

	var wg sync.WaitGroup
	// Spawn 50 goroutines adding tasks
	for i := range 50 {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			task := &TaskRun{TaskID: string(rune('A' + id))}
			tm.AddTask(task)
			time.Sleep(time.Millisecond)
			tm.RemoveTask(task.TaskID)
		}(i)
	}
	wg.Wait()

	require.True(t, tm.IsIdle())
}
