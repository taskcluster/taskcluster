package main

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v30/internal/workerproto"
	wptesting "github.com/taskcluster/taskcluster/v30/internal/workerproto/testing"
	"github.com/taskcluster/taskcluster/v30/workers/generic-worker/graceful"
)

func setupWorkerRunnerTest(runnerCapabilities ...string) (*workerproto.Protocol, func()) {
	graceful.Reset()
	workerTransport, runnerTransport := wptesting.NewLocalTransportPair()

	// set up the runner side of the protocol
	runnerProto := workerproto.NewProtocol(runnerTransport)
	for _, cap := range runnerCapabilities {
		runnerProto.AddCapability(cap)
	}
	runnerProto.Start(false)

	// set up the worker side of the protocol
	WorkerRunnerProtocol = workerproto.NewProtocol(workerTransport)
	startProtocol()

	runnerProto.WaitUntilInitialized()

	return runnerProto, func() {
		runnerTransport.Close()
		workerTransport.Close()
	}
}

func TestGracefulTermination(t *testing.T) {
	runnerProto, cleanup := setupWorkerRunnerTest("graceful-termination")
	defer cleanup()

	require.False(t, graceful.TerminationRequested())

	done := make(chan bool, 1)

	graceful.OnTerminationRequest(func(finishTasks bool) {
		done <- finishTasks
	})

	runnerProto.Send(workerproto.Message{
		Type: "graceful-termination",
		Properties: map[string]interface{}{
			"finish-tasks": true,
		},
	})

	finishTasks := <-done
	require.True(t, finishTasks)
	require.True(t, graceful.TerminationRequested())
}
