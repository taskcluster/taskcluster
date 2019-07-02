package runner

import (
	taskcluster "github.com/taskcluster/taskcluster/clients/client-go/v14"
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

	// metadata from the provider (useful to display to the user for
	// debugging).  Workers should not *require* any data to exist
	// in this map, and where possible should just pass it along as-is
	// in worker config as helpful debugging metadata for the user.
	ProviderMetadata map[string]string

	// the accumulated WorkerConfig for this run
	WorkerConfig *cfg.WorkerConfig
}
