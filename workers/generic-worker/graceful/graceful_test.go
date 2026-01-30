package graceful

import (
	"testing"
	"time"

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
		var res *bool // pointer is to distinguish nil from false
		OnTerminationRequest("task1", func(finishTasks bool) { res = &finishTasks })
		Terminate(false)
		// Give goroutine time to execute
		time.Sleep(10 * time.Millisecond)
		require.NotNil(t, res)
		require.Equal(t, false, *res)
		require.Equal(t, true, TerminationRequested())
	})

	t.Run("WithRemovedCallback", func(t *testing.T) {
		Reset()
		var cb1 *bool
		remove1 := OnTerminationRequest("task1", func(finishTasks bool) { cb1 = &finishTasks })
		remove1()

		var cb2 *bool
		OnTerminationRequest("task2", func(finishTasks bool) { cb2 = &finishTasks })

		Terminate(true)
		// Give goroutine time to execute
		time.Sleep(10 * time.Millisecond)

		require.Nil(t, cb1)
		require.NotNil(t, cb2)
		require.Equal(t, true, *cb2)
		require.Equal(t, true, TerminationRequested())
	})

	t.Run("MultipleCallbacks", func(t *testing.T) {
		Reset()
		var cb1, cb2, cb3 *bool
		OnTerminationRequest("task1", func(finishTasks bool) { cb1 = &finishTasks })
		OnTerminationRequest("task2", func(finishTasks bool) { cb2 = &finishTasks })
		OnTerminationRequest("task3", func(finishTasks bool) { cb3 = &finishTasks })

		require.Equal(t, 3, CallbackCount())

		Terminate(true)
		// Give goroutines time to execute
		time.Sleep(10 * time.Millisecond)

		require.NotNil(t, cb1)
		require.NotNil(t, cb2)
		require.NotNil(t, cb3)
		require.Equal(t, true, *cb1)
		require.Equal(t, true, *cb2)
		require.Equal(t, true, *cb3)
	})

	t.Run("CallbackRegisteredAfterTermination", func(t *testing.T) {
		Reset()
		Terminate(true)

		var cb *bool
		OnTerminationRequest("late-task", func(finishTasks bool) { cb = &finishTasks })
		// Give goroutine time to execute
		time.Sleep(10 * time.Millisecond)

		require.NotNil(t, cb)
		require.Equal(t, true, *cb)
	})

	t.Run("LegacyCallback", func(t *testing.T) {
		Reset()
		var res *bool
		OnTerminationRequestLegacy(func(finishTasks bool) { res = &finishTasks })
		Terminate(false)
		// Give goroutine time to execute
		time.Sleep(10 * time.Millisecond)
		require.NotNil(t, res)
		require.Equal(t, false, *res)
	})
}
