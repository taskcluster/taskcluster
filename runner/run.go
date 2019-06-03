package runner

import (
	taskcluster "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
)

// Run represents all of the information required to run the worker.  Its
// contents are built up bit-by-bit during the start-worker process.
type Run struct {
	// Information about the Taskcluster deployment where this
	// worker is runing
	RootURL     string
	Credentials taskcluster.Credentials

	// Information about this worker
	WorkerPoolID string
	WorkerGroup  string
	WorkerID     string

	// the accumulated WorkerConfig for this run
	WorkerConfig cfg.WorkerConfig
}
