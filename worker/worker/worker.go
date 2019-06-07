package worker

import "github.com/taskcluster/taskcluster-worker-runner/runner"

// Worker is responsible for determining the identity of this worker and gathering
// Takcluster credentials.
type Worker interface {
	// Configure the given run.  This is expected to set the Taskcluster deployment
	// and worker-information fields, but may modify any part of the run it desires.
	ConfigureRun(run *runner.Run) error

	// Actually start the worker.
	StartWorker(run *runner.Run) error
}
