package run

import (
	"time"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/files"
	taskcluster "github.com/taskcluster/taskcluster/clients/client-go/v15"
)

// State represents the state of the worker run.  Its contents are built up
// bit-by-bit during the start-worker process.
type State struct {
	// Information about the Taskcluster deployment where this
	// worker is runing
	RootURL string

	// Credentials for the worker, and their expiration time.  Shortly before
	// this expiration, worker-runner will try to gracefully stop the worker
	Credentials       taskcluster.Credentials
	CredentialsExpire time.Time

	// Information about this worker
	WorkerPoolID string
	WorkerGroup  string
	WorkerID     string

	// metadata from the provider (useful to display to the user for
	// debugging).  Workers should not *require* any data to exist
	// in this map, and where possible should just pass it along as-is
	// in worker config as helpful debugging metadata for the user.
	ProviderMetadata map[string]string

	// the accumulated WorkerConfig for this run, including files to create
	WorkerConfig *cfg.WorkerConfig
	Files        []files.File
}
