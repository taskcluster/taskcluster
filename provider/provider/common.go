package provider

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/taskcluster/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
	"github.com/taskcluster/taskcluster/clients/client-go/v18/tcworkermanager"
)

// Register this worker with the worker-manager, and update the state with the parameters and the results.
func RegisterWorker(state *run.State, wm tc.WorkerManager, workerPoolID, providerID, workerGroup, workerID string, workerIdentityProofMap map[string]interface{}) error {
	workerIdentityProof, err := json.Marshal(workerIdentityProofMap)
	if err != nil {
		return err
	}

	reg, err := wm.RegisterWorker(&tcworkermanager.RegisterWorkerRequest{
		WorkerPoolID:        workerPoolID,
		ProviderID:          providerID,
		WorkerGroup:         workerGroup,
		WorkerID:            workerID,
		WorkerIdentityProof: json.RawMessage(workerIdentityProof),
	})
	if err != nil {
		return fmt.Errorf("Could not register worker: %v", err)
	}

	state.WorkerPoolID = workerPoolID
	state.WorkerID = workerID
	state.WorkerGroup = workerGroup

	state.Credentials.ClientID = reg.Credentials.ClientID
	state.Credentials.AccessToken = reg.Credentials.AccessToken
	state.Credentials.Certificate = reg.Credentials.Certificate

	state.CredentialsExpire = time.Time(reg.Expires)

	return nil
}
