package registration

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	taskcluster "github.com/taskcluster/taskcluster/v30/clients/client-go"
	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v30/internal/workerproto"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/tc"
)

type RegistrationManager struct {
	runnercfg *cfg.RunnerConfig
	state     *run.State

	// Factory for worker-manager clients
	factory tc.WorkerManagerClientFactory

	// the protocol (set in SetProtocol)
	proto *workerproto.Protocol

	// a timer to handle sending a new-credentials or graceful-termination
	// request before the credentials expire
	credsExpireTimer *time.Timer
}

// Register this worker with the worker-manager, and update the state with the
// results
func (reg *RegistrationManager) RegisterWorker(workerIdentityProofMap map[string]interface{}) error {
	reg.state.Lock()
	defer reg.state.Unlock()

	// registration does not require credentials
	wm, err := reg.factory(reg.state.RootURL, nil)
	if err != nil {
		return err
	}

	workerIdentityProof, err := json.Marshal(workerIdentityProofMap)
	if err != nil {
		return err
	}

	res, err := wm.RegisterWorker(&tcworkermanager.RegisterWorkerRequest{
		WorkerPoolID:        reg.state.WorkerPoolID,
		ProviderID:          reg.state.ProviderID,
		WorkerGroup:         reg.state.WorkerGroup,
		WorkerID:            reg.state.WorkerID,
		WorkerIdentityProof: json.RawMessage(workerIdentityProof),
	})
	if err != nil {
		return fmt.Errorf("Could not register worker: %w", err)
	}

	reg.state.Credentials.ClientID = res.Credentials.ClientID
	reg.state.Credentials.AccessToken = res.Credentials.AccessToken
	reg.state.Credentials.Certificate = res.Credentials.Certificate

	reg.state.CredentialsExpire = time.Time(res.Expires)

	if res.WorkerConfig != nil {
		pwc, err := cfg.ParseProviderWorkerConfig(reg.runnercfg, &res.WorkerConfig)
		if err != nil {
			return err
		}

		reg.state.WorkerConfig = reg.state.WorkerConfig.Merge(pwc.Config)
		reg.state.Files = append(reg.state.Files, pwc.Files...)
	}

	return nil
}

func (reg *RegistrationManager) UseCachedRun() error {
	return nil
}

func (reg *RegistrationManager) SetProtocol(proto *workerproto.Protocol) {
	reg.proto = proto
	proto.AddCapability("graceful-termination")
}

func (reg *RegistrationManager) WorkerStarted() error {
	reg.state.Lock()
	defer reg.state.Unlock()

	// gracefully terminate the worker when the credentials expire, if they expire
	if reg.state.CredentialsExpire.IsZero() {
		return nil
	}

	untilExpire := time.Until(reg.state.CredentialsExpire)
	reg.credsExpireTimer = time.AfterFunc(untilExpire-30*time.Second, func() {
		if reg.proto != nil && reg.proto.Capable("graceful-termination") {
			log.Println("Taskcluster Credentials are expiring in 30s; stopping worker")
			reg.proto.Send(workerproto.Message{
				Type: "graceful-termination",
				Properties: map[string]interface{}{
					// credentials are expiring, so no time to shut down..
					"finish-tasks": false,
				},
			})
		}
	})

	return nil
}

func (reg *RegistrationManager) WorkerFinished() error {
	if reg.credsExpireTimer != nil {
		reg.credsExpireTimer.Stop()
		reg.credsExpireTimer = nil
	}
	return nil
}

// Make a new RegistrationManager object
func New(runnercfg *cfg.RunnerConfig, state *run.State) *RegistrationManager {
	return new(runnercfg, state, nil)
}

// Private constructor allowing injection of a fake factory
func new(runnercfg *cfg.RunnerConfig, state *run.State, factory tc.WorkerManagerClientFactory) *RegistrationManager {
	if factory == nil {
		factory = func(rootURL string, credentials *taskcluster.Credentials) (tc.WorkerManager, error) {
			prov := tcworkermanager.New(credentials, rootURL)
			return prov, nil
		}
	}

	return &RegistrationManager{
		runnercfg: runnercfg,
		state:     state,
		factory:   factory,
	}
}
