package provider

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/tc"
)

// WorkerInfo contains the information to identify the worker
type WorkerInfo struct {
	WorkerPoolID, WorkerGroup, WorkerID string
}

// Register this worker with the worker-manager, and update the state with the parameters and the results.
func RegisterWorker(state *run.State, wm tc.WorkerManager, workerPoolID, providerID, workerGroup, workerID string, workerIdentityProofMap map[string]interface{}) (*json.RawMessage, error) {
	workerIdentityProof, err := json.Marshal(workerIdentityProofMap)
	if err != nil {
		return nil, err
	}

	reg, err := wm.RegisterWorker(&tcworkermanager.RegisterWorkerRequest{
		WorkerPoolID:        workerPoolID,
		ProviderID:          providerID,
		WorkerGroup:         workerGroup,
		WorkerID:            workerID,
		WorkerIdentityProof: json.RawMessage(workerIdentityProof),
	})
	if err != nil {
		return nil, fmt.Errorf("Could not register worker: %v", err)
	}

	state.WorkerPoolID = workerPoolID
	state.WorkerID = workerID
	state.WorkerGroup = workerGroup

	state.Credentials.ClientID = reg.Credentials.ClientID
	state.Credentials.AccessToken = reg.Credentials.AccessToken
	state.Credentials.Certificate = reg.Credentials.Certificate

	state.CredentialsExpire = time.Time(reg.Expires)

	wc := json.RawMessage(`{}`)
	if reg.WorkerConfig != nil {
		wc = reg.WorkerConfig
	}

	return &wc, nil
}

// RemoveWorker will request worker-manager to terminate the given worker, if it
// fails, it shuts down us
func RemoveWorker(state *run.State, factory tc.WorkerManagerClientFactory) error {
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
