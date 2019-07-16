package static

import (
	"fmt"

	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
	tcclient "github.com/taskcluster/taskcluster/clients/client-go/v14"
	"github.com/taskcluster/taskcluster/clients/client-go/v14/tcworkermanager"
)

type staticProviderConfig struct {
	RootURL      string
	ProviderID   string
	WorkerPoolID string
	WorkerGroup  string
	WorkerID     string
	StaticSecret string
}

type StaticProvider struct {
	runnercfg                  *runner.RunnerConfig
	workerManagerClientFactory tc.WorkerManagerClientFactory
	proto                      *protocol.Protocol
}

func (p *StaticProvider) ConfigureRun(run *runner.Run) error {
	var pc staticProviderConfig
	err := p.runnercfg.Provider.Unpack(&pc)
	if err != nil {
		return err
	}

	run.RootURL = pc.RootURL

	// We need a worker manager client for fetching taskcluster credentials.
	// Ensure auth is disabled in client, since we don't have credentials yet.
	wm, err := p.workerManagerClientFactory(run.RootURL, nil)
	if err != nil {
		return fmt.Errorf("Could not create worker manager client: %v", err)
	}

	err = provider.RegisterWorker(run, wm, pc.WorkerPoolID, pc.ProviderID, pc.WorkerGroup, pc.WorkerID, "staticSecret", pc.StaticSecret)
	if err != nil {
		return err
	}

	run.ProviderMetadata = map[string]string{}

	return nil
}

func (p *StaticProvider) SetProtocol(proto *protocol.Protocol) {
	p.proto = proto
}

func (p *StaticProvider) WorkerStarted() error {
	return nil
}

func (p *StaticProvider) WorkerFinished() error {
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
		staticSecret: ... // shared secret configured for this worker in worker-manager
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
