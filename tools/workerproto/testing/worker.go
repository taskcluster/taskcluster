package testing

import (
	"sync"

	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
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

	// condition variable used to wait for a "test-flush" method
	flushToWorker *sync.Cond
	flushToRunner *sync.Cond
}

// Close down the fake worker.  Call this to dispose of resources.
func (wkr *FakeWorker) Close() {
	wkr.workerTransp.Close()
	wkr.runnerTransp.Close()
}

// Generate a function that can be called to assert that message of the given
// type has or has not been received by the worker.  This is useful for
// building assertions.  This function flushes all messages sent to the worker
// before performing its check.
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
		wkr.FlushMessagesToWorker()

		receivedMutex.Lock()
		defer receivedMutex.Unlock()
		return received
	}
}

// Return only after all messages to the worker sent before this call have been
// received
func (wkr *FakeWorker) FlushMessagesToWorker() {
	wkr.flushToWorker.L.Lock()
	// send a flush message, and wait until it is received.  Since messages
	// are delivered in-order, this indicate that all previously sent messages
	// have been fully received.
	wkr.RunnerProtocol.Send(workerproto.Message{Type: "test-flush"})
	wkr.flushToWorker.Wait()
	wkr.flushToWorker.L.Unlock()
}

// Return only after all messages to the worker sent before this call have been
// received
func (wkr *FakeWorker) FlushMessagesToRunner() {
	wkr.flushToRunner.L.Lock()
	// send a flush message, and wait until it is received.  Since messages
	// are delivered in-order, this indicate that all previously sent messages
	// have been fully received.
	wkr.WorkerProtocol.Send(workerproto.Message{Type: "test-flush"})
	wkr.flushToRunner.Wait()
	wkr.flushToRunner.L.Unlock()
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

	// we "flush" messages by sending a "test-flush" message and
	// signalling this condition variable when it is received.
	flushToWorker := sync.NewCond(&sync.Mutex{})
	flushToRunner := sync.NewCond(&sync.Mutex{})

	workerProto.Register("test-flush", func(msg workerproto.Message) {
		flushToWorker.L.Lock()
		flushToWorker.Broadcast()
		flushToWorker.L.Unlock()
	})

	runnerProto.Register("test-flush", func(msg workerproto.Message) {
		flushToRunner.L.Lock()
		flushToRunner.Broadcast()
		flushToRunner.L.Unlock()
	})

	return &FakeWorker{
		RunnerProtocol: runnerProto,
		WorkerProtocol: workerProto,
		workerTransp:   workerTransp,
		runnerTransp:   runnerTransp,
		flushToWorker:  flushToWorker,
		flushToRunner:  flushToRunner,
	}
}
