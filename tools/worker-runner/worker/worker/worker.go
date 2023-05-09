package worker

import (
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
)

// Worker is responsible for determining the identity of this worker and gathering
// Takcluster credentials.
type Worker interface {
	// Configure the given state.  This is expected to set the Taskcluster deployment
	// and worker-information fields, but may modify any part of the state it desires.
	ConfigureRun(state *run.State) error

	// In a subsequent run with cacheOverRestarts set, this method is called
	// instead of ConfigureRun.  It should recover any worker state required
	// from the given Run.
	UseCachedRun(run *run.State) error

	// Actually start the worker, returning once it has been started.
	StartWorker(state *run.State) (workerproto.Transport, error)

	// Set the protocol used for communication with this worker.  This is an appropriate
	// time to register for interesting messages from the worker.
	SetProtocol(proto *workerproto.Protocol)

	// Wait for the worker to terminate
	Wait() error
}
