package graceful

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGracefulTermination(t *testing.T) {
	t.Run("NoCallbacks", func(t *testing.T) {
		Reset()
		Terminate(true)
		require.Equal(t, true, TerminationRequested())
	})

	t.Run("WithCallback", func(t *testing.T) {
		Reset()
		done := make(chan bool, 1)
		OnTerminationRequest("task1", func(finishTasks bool) { done <- finishTasks })
		Terminate(false)
		res := <-done
		require.Equal(t, false, res)
		require.Equal(t, true, TerminationRequested())
	})

	t.Run("WithRemovedCallback", func(t *testing.T) {
		Reset()
		done1 := make(chan bool, 1)
		remove1 := OnTerminationRequest("task1", func(finishTasks bool) { done1 <- finishTasks })
		remove1()

		done2 := make(chan bool, 1)
		OnTerminationRequest("task2", func(finishTasks bool) { done2 <- finishTasks })

		Terminate(true)
		res := <-done2

		// cb1 should not have been called since it was removed
		select {
		case <-done1:
			t.Fatal("removed callback should not have been called")
		default:
		}

		require.Equal(t, true, res)
		require.Equal(t, true, TerminationRequested())
	})

	t.Run("MultipleCallbacks", func(t *testing.T) {
		Reset()
		done1 := make(chan bool, 1)
		done2 := make(chan bool, 1)
		done3 := make(chan bool, 1)
		OnTerminationRequest("task1", func(finishTasks bool) { done1 <- finishTasks })
		OnTerminationRequest("task2", func(finishTasks bool) { done2 <- finishTasks })
		OnTerminationRequest("task3", func(finishTasks bool) { done3 <- finishTasks })

		require.Equal(t, 3, CallbackCount())

		Terminate(true)

		res1 := <-done1
		res2 := <-done2
		res3 := <-done3

		require.Equal(t, true, res1)
		require.Equal(t, true, res2)
		require.Equal(t, true, res3)
	})

	t.Run("CallbackRegisteredAfterTermination", func(t *testing.T) {
		Reset()
		Terminate(true)

		done := make(chan bool, 1)
		OnTerminationRequest("late-task", func(finishTasks bool) { done <- finishTasks })
		res := <-done

		require.Equal(t, true, res)
	})

	t.Run("LegacyCallback", func(t *testing.T) {
		Reset()
		done := make(chan bool, 1)
		OnTerminationRequestLegacy(func(finishTasks bool) { done <- finishTasks })
		Terminate(false)
		res := <-done
		require.Equal(t, false, res)
	})
}
