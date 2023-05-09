package testing

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
)

func TestLocalTransport(t *testing.T) {
	worker, runner := NewLocalTransportPair()

	testDirection := func(t *testing.T, a *LocalTransport, b *LocalTransport) {
		a.Send(workerproto.Message{
			Type: "test",
			Properties: map[string]interface{}{
				"test": true,
			},
		})

		msg, ok := b.Recv()
		require.Equal(t, true, ok)
		require.Equal(t, "test", msg.Type)
	}

	t.Run("worker-to-runner", func(t *testing.T) { testDirection(t, worker, runner) })
	t.Run("runner-to-worker", func(t *testing.T) { testDirection(t, runner, worker) })

	testClosed := func(t *testing.T, a *LocalTransport) {
		_, ok := a.Recv()
		require.Equal(t, false, ok)
	}

	worker.Close()
	t.Run("worker-closed", func(t *testing.T) { testClosed(t, runner) })

	runner.Close()
	t.Run("runner-closed", func(t *testing.T) { testClosed(t, worker) })
}
