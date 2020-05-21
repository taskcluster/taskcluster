package run

import (
	"fmt"
	"strings"
	"time"

	taskcluster "github.com/taskcluster/taskcluster/v30/clients/client-go"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/files"
)

// State represents the state of the worker run.  Its contents are built up
// bit-by-bit during the start-worker process.
type State struct {
	// Information about the Taskcluster deployment where this
	// worker is running
	RootURL string

	// Credentials for the worker, and their expiration time.  Shortly before
	// this expiration, worker-runner will try to gracefully stop the worker
	Credentials       taskcluster.Credentials
	CredentialsExpire time.Time `yaml:",omitempty"`

	// Information about this worker
	WorkerPoolID string
	WorkerGroup  string
	WorkerID     string

	// metadata from the provider (useful to display to the user for
	// debugging).
	//
	// Docker-worker currently expects the following properties:
	//
	//  * public-hostname
	//  * public-ipv4
	//  * local-ipv4
	//  * instance-type
	//  * instance-id
	//  * region
	//
	// It doesn't, strictly speaking, require these fields,
	// but may fall onto undesirable defaults if these are not provided
	// A bit more info on that here
	// https://github.com/taskcluster/taskcluster-worker-runner/pull/30#pullrequestreview-277378260
	ProviderMetadata map[string]interface{}

	// the accumulated WorkerConfig for this run, including files to create
	WorkerConfig *cfg.WorkerConfig
	Files        []files.File

	// The worker location configuration
	WorkerLocation map[string]string
}

// Check that the provided provided the information it was supposed to.
func (state *State) CheckProviderResults() error {
	if state.RootURL == "" {
		return fmt.Errorf("provider did not set RootURL")
	}

	if strings.HasSuffix(state.RootURL, "/") {
		return fmt.Errorf("RootURL must not end with `/`")
	}

	if state.Credentials.ClientID == "" {
		return fmt.Errorf("provider did not set Credentials.ClientID")
	}

	if state.WorkerPoolID == "" {
		return fmt.Errorf("provider did not set WorkerPoolID")
	}

	if state.WorkerGroup == "" {
		return fmt.Errorf("provider did not set WorkerGroup")
	}

	if state.WorkerID == "" {
		return fmt.Errorf("provider did not set WorkerID")
	}

	if state.WorkerLocation["cloud"] == "" {
		return fmt.Errorf("provider did not set the cloud name")
	}

	return nil
}
