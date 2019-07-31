package provider

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
	"github.com/taskcluster/taskcluster/clients/client-go/v15/tcworkermanager"
)

// Register this worker with the worker-manager, and update the run with the parameters and the results.
func RegisterWorker(run *runner.Run, wm tc.WorkerManager, workerPoolID, providerID, workerGroup, workerID, workerIdentityKey, workerIdentityValue string) error {
	workerIdentityProofMap := map[string]interface{}{workerIdentityKey: interface{}(workerIdentityValue)}
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

	run.WorkerPoolID = workerPoolID
	run.WorkerID = workerID
	run.WorkerGroup = workerGroup

	run.Credentials.ClientID = reg.Credentials.ClientID
	run.Credentials.AccessToken = reg.Credentials.AccessToken
	run.Credentials.Certificate = reg.Credentials.Certificate

	run.CredentialsExpire = time.Time(reg.Expires)

	return nil
}
