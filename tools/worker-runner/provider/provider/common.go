package provider

import (
	"log"

	"github.com/taskcluster/taskcluster/v31/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v31/tools/worker-runner/tc"
)

// WorkerInfo contains the information to identify the worker
type WorkerInfo struct {
	WorkerPoolID, WorkerGroup, WorkerID string
}

// RemoveWorker will request worker-manager to terminate the given worker, if it
// fails, it shuts down us.  This is to be called *without* a lock on state
func RemoveWorker(state *run.State, factory tc.WorkerManagerClientFactory) error {
	state.Lock()
	defer state.Unlock()

	shutdown := func() error {
		log.Printf("Falling back to system shutdown")
		if err := Shutdown(); err != nil {
			log.Printf("Error shutting down the worker: %v\n", err)
			return err
		}
		return nil
	}

	wc, err := factory(state.RootURL, &state.Credentials)
	if err != nil {
		log.Printf("Error instanciating worker-manager client: %v\n", err)
		return shutdown()
	}

	if err = wc.RemoveWorker(state.WorkerPoolID, state.WorkerGroup, state.WorkerID); err != nil {
		log.Printf("Error removing the worker: %v\n", err)
		return shutdown()
	}

	return err
}
