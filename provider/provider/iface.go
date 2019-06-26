package provider

import (
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
)

// Provider is responsible for determining the identity of this worker and gathering
// Takcluster credentials.
type Provider interface {
	// Configure the given run.  This is expected to set the Taskcluster deployment
	// and worker-information fields, but may modify any part of the run it desires.
	ConfigureRun(run *runner.Run) error

	// Set the protocol used for communication with this worker.  This is an appropriate
	// time to register for interesting messages from the worker.
	SetProtocol(proto *protocol.Protocol)

	// The worker has started.  This is an appropriate time to set up any
	// provider-specific things that should occur while the worker is running.
	// Note that this is called before the protocol has started, so it will still
	// have no capabilities.
	WorkerStarted() error

	// The worker has exited.  Handle any necessary communication with the provider.
	// Note that this method may not always be called, e.g., in the event of a system
	// failure.
	WorkerFinished() error
}
