package static

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
	tcclient "github.com/taskcluster/taskcluster/clients/client-go/v14"
	"github.com/taskcluster/taskcluster/clients/client-go/v14/tcworkermanager"
)

type staticProviderConfig struct {
	RootURL        string
	ProviderID     string
	WorkerPoolID   string
	WorkerGroup    string
	WorkerID       string
	IdentitySecret string
}

type StaticProvider struct {
	runnercfg                  *runner.RunnerConfig
	workerManagerClientFactory tc.WorkerManagerClientFactory
	proto                      *protocol.Protocol

	credsExpire      tcclient.Time
	credsExpireTimer *time.Timer
}

func (p *StaticProvider) ConfigureRun(run *runner.Run) error {
	var pc staticProviderConfig
	err := p.runnercfg.Provider.Unpack(&pc)
	if err != nil {
		return err
	}

	run.RootURL = pc.RootURL
	run.WorkerPoolID = pc.WorkerPoolID
	run.WorkerGroup = pc.WorkerGroup
	run.WorkerID = pc.WorkerID

	workerIdentityProofMap := map[string]interface{}{"secret": interface{}(pc.IdentitySecret)}
	workerIdentityProof, err := json.Marshal(workerIdentityProofMap)
	if err != nil {
		return err
	}

	// We need a worker manager client for fetching taskcluster credentials.
	// Ensure auth is disabled in client, since we don't have credentials yet.
	wm, err := p.workerManagerClientFactory(run.RootURL, nil)
	if err != nil {
		return fmt.Errorf("Could not create worker manager client: %v", err)
	}

	reg, err := wm.RegisterWorker(&tcworkermanager.RegisterWorkerRequest{
		WorkerPoolID:        pc.WorkerPoolID,
		ProviderID:          pc.ProviderID,
		WorkerGroup:         pc.WorkerGroup,
		WorkerID:            pc.WorkerID,
		WorkerIdentityProof: json.RawMessage(workerIdentityProof),
	})
	if err != nil {
		return fmt.Errorf("Could not register worker: %v", err)
	}

	run.Credentials.ClientID = reg.Credentials.ClientID
	run.Credentials.AccessToken = reg.Credentials.AccessToken
	run.Credentials.Certificate = reg.Credentials.Certificate

	p.credsExpire = reg.Expires

	run.ProviderMetadata = map[string]string{}

	return nil
}

func (p *StaticProvider) SetProtocol(proto *protocol.Protocol) {
	p.proto = proto
}

func (p *StaticProvider) WorkerStarted() error {
	// gracefully terminate the worker when the credentials expire
	untilExpire := time.Until(time.Time(p.credsExpire))
	p.credsExpireTimer = time.AfterFunc(untilExpire-30*time.Second, func() {
		if p.proto != nil && p.proto.Capable("graceful-termination") {
			log.Println("Taskcluster Credentials are expiring in 30s; stopping worker")
			p.proto.Send(protocol.Message{
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

func (p *StaticProvider) WorkerFinished() error {
	if p.credsExpireTimer != nil {
		p.credsExpireTimer.Stop()
		p.credsExpireTimer = nil
	}
	return nil
}

func clientFactory(rootURL string, credentials *tcclient.Credentials) (tc.WorkerManager, error) {
	prov := tcworkermanager.New(credentials, rootURL)
	return prov, nil
}

func New(runnercfg *runner.RunnerConfig) (provider.Provider, error) {
	return new(runnercfg, nil)
}

func Usage() string {
	return `
The providerType "static" is intended for workers provisioned with worker-manager
providers using providerType "static".  It requires

	provider:
		providerType: static
		rootURL: ...
		providerID: ...
		workerPoolID: ...
		workerGroup: ...
		workerID: ...
		identitySecret: ... // shared secret configured for this worker in worker-manager
`
}

// New takes its dependencies as optional arguments, allowing injection of fake dependencies for testing.
func new(runnercfg *runner.RunnerConfig, workerManagerClientFactory tc.WorkerManagerClientFactory) (*StaticProvider, error) {
	if workerManagerClientFactory == nil {
		workerManagerClientFactory = clientFactory
	}
	return &StaticProvider{
		runnercfg:                  runnercfg,
		workerManagerClientFactory: workerManagerClientFactory,
		proto:                      nil,
	}, nil
}
