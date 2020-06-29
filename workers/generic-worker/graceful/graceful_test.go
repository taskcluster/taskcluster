package graceful

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGracefulTermination(t *testing.T) {
	cleanup := func() {
		terminationRequested = false
		callback = nil
	}

	cleanup()
	t.Run("NoCallbacks", func(t *testing.T) {
		Terminate(true)
		require.Equal(t, true, TerminationRequested())
	})

	cleanup()
	t.Run("WithCallback", func(t *testing.T) {
		var res *bool // pointer is to distinguish nil from false
		OnTerminationRequest(func(finishTasks bool) { res = &finishTasks })
		Terminate(false)
		require.Equal(t, false, *res)
		require.Equal(t, true, TerminationRequested())
	})

	cleanup()
	t.Run("WithRemovedCallback", func(t *testing.T) {
		var cb1 *bool
		remove1 := OnTerminationRequest(func(finishTasks bool) { cb1 = &finishTasks })
		remove1()

		var cb2 *bool
		OnTerminationRequest(func(finishTasks bool) { cb2 = &finishTasks })

		Terminate(true)

		require.Nil(t, cb1)
		require.Equal(t, true, *cb2)
		require.Equal(t, true, TerminationRequested())
	})
}
