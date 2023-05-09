package run

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"

	taskcluster "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/files"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/perms"
)

// State represents the state of the worker run.  Its contents are built up
// bit-by-bit during the start-worker process.  Access to all fields is gated
// by the mutex.
type State struct {
	sync.RWMutex

	// Information about the Taskcluster deployment where this
	// worker is running
	RootURL string

	// Credentials for the worker, and their expiration time.  Shortly before
	// this expiration, worker-runner will try to gracefully stop the worker
	Credentials        taskcluster.Credentials
	CredentialsExpire  taskcluster.Time `yaml:",omitempty"`
	RegistrationSecret string

	// Information about this worker
	WorkerPoolID string
	WorkerGroup  string
	WorkerID     string
	ProviderID   string

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
	state.Lock()
	defer state.Unlock()

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

	if state.ProviderID == "" {
		return fmt.Errorf("provider did not set ProviderID")
	}

	if state.WorkerLocation["cloud"] == "" {
		return fmt.Errorf("provider did not set the cloud name")
	}

	return nil
}

// Write the state to the given cache file, checking permissions along the way
func (state *State) WriteCacheFile(filename string) error {
	log.Printf("Caching worker-runner state at %s", filename)
	var encoded []byte
	encoded, err := json.Marshal(&state)
	if err != nil {
		return err
	}
	err = perms.WritePrivateFile(filename, encoded)
	if err != nil {
		return err
	}

	return nil
}

// Read a file written by WriteCacheFile.  First return value is true
// if the file existed and false otherwise.
func ReadCacheFile(state *State, filename string) (bool, error) {
	var encoded []byte

	encoded, err := perms.ReadPrivateFile(filename)
	if err == nil {
		log.Printf("Loading cached state from %s", filename)

		err = json.Unmarshal(encoded, state)
		if err != nil {
			return true, err
		}

		return true, nil
	} else if os.IsNotExist(err) {
		// no such file
		return false, nil
	} else {
		return true, err
	}
}
