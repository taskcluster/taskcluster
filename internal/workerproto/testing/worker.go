package testing

import (
	"sync"
	"time"

	"github.com/taskcluster/taskcluster/v30/internal/workerproto"
)

// FakeWorker implements a fake worker, in terms of the protocol at least
type FakeWorker struct {
	// The protocol with which to communicate with this worker.  Use this
	// as a protocol for testing worker-runner.
	RunnerProtocol *workerproto.Protocol

	// The protocol representing the worker side; register for messages on
	// this to confirm that messages were received
	WorkerProtocol *workerproto.Protocol

	workerTransp *LocalTransport
	runnerTransp *LocalTransport
}

// Close down the fake worker.  Call this to dispose of resources.
func (wkr *FakeWorker) Close() {
	wkr.workerTransp.Close()
	wkr.runnerTransp.Close()
}

// Generate a function that can be called to assert that message of the given
// type has or has not been received.  This is useful for building assertions.
func (wkr *FakeWorker) MessageReceivedFunc(msgType string, matcher func(msg workerproto.Message) bool) func() bool {
	received := false
	receivedMutex := sync.Mutex{}

	wkr.WorkerProtocol.Register(msgType, func(msg workerproto.Message) {
		if matcher == nil || matcher(msg) {
			receivedMutex.Lock()
			defer receivedMutex.Unlock()
			received = true
		}
	})

	return func() bool {
		// allow the receive goroutine time to receive the message
		time.Sleep(10 * time.Millisecond)

		receivedMutex.Lock()
		defer receivedMutex.Unlock()
		return received
	}
}

// Create a new fake worker with the given capabilities.  The worker side
// of this protocol is started, but the runner side is not -- that is up
// to the caller.
func NewFakeWorkerWithCapabilities(capabilities ...string) *FakeWorker {
	workerTransp, runnerTransp := NewLocalTransportPair()
	workerProto := workerproto.NewProtocol(workerTransp)
	runnerProto := workerproto.NewProtocol(runnerTransp)

	for _, capability := range capabilities {
		workerProto.AddCapability(capability)
	}
	workerProto.Start(true)

	return &FakeWorker{
		RunnerProtocol: runnerProto,
		WorkerProtocol: workerProto,
		workerTransp:   workerTransp,
		runnerTransp:   runnerTransp,
	}
}
