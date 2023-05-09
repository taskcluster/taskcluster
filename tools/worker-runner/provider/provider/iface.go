package provider

import (
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
)

// Provider is responsible for determining the identity of this worker and gathering
// Takcluster credentials.
type Provider interface {
	// Configure the given state.  This is expected to set the Taskcluster deployment
	// and worker-information fields, but may modify any part of the state it desires.
	ConfigureRun(state *run.State) error

	// Get the worker identity proof to pass to worker-manager, or return nil
	// to skip calling workerManager.registerWorker at all, in which case
	// ConfigureRun should set state.Credentials correctly.
	GetWorkerIdentityProof() (map[string]interface{}, error)

	// In a subsequent run with cacheOverRestarts set, this method is called
	// instead of ConfigureRun.  It should recover any provider state required
	// from the given Run.
	UseCachedRun(run *run.State) error

	// Set the protocol used for communication with this worker.  This is an appropriate
	// time to register for interesting messages from the worker.
	SetProtocol(proto *workerproto.Protocol)

	// The worker has started.  This is an appropriate time to set up any
	// provider-specific things that should occur while the worker is running.
	// Note that this is called before the protocol has started, so it will still
	// have no capabilities.
	WorkerStarted(state *run.State) error

	// The worker has exited.  Handle any necessary communication with the provider.
	// Note that this method may not always be called, e.g., in the event of a system
	// failure.
	WorkerFinished(state *run.State) error
}
