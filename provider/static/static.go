package static

import (
	"fmt"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
	tcclient "github.com/taskcluster/taskcluster/clients/client-go/v22"
	"github.com/taskcluster/taskcluster/clients/client-go/v22/tcworkermanager"
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
	runnercfg                  *cfg.RunnerConfig
	workerManagerClientFactory tc.WorkerManagerClientFactory
	proto                      *protocol.Protocol
}

func (p *StaticProvider) ConfigureRun(state *run.State) error {
	var pc staticProviderConfig
	err := p.runnercfg.Provider.Unpack(&pc)
	if err != nil {
		return err
	}

	state.RootURL = pc.RootURL

	// We need a worker manager client for fetching taskcluster credentials.
	// Ensure auth is disabled in client, since we don't have credentials yet.
	wm, err := p.workerManagerClientFactory(state.RootURL, nil)
	if err != nil {
		return fmt.Errorf("Could not create worker manager client: %v", err)
	}

	workerIdentityProofMap := map[string]interface{}{"staticSecret": interface{}(pc.StaticSecret)}

	err = provider.RegisterWorker(state, wm, pc.WorkerPoolID, pc.ProviderID, pc.WorkerGroup, pc.WorkerID, workerIdentityProofMap)
	if err != nil {
		return err
	}

	state.ProviderMetadata = map[string]string{}
	state.WorkerLocation = map[string]string{
		"cloud": "static",
	}

	if workerLocation, ok := p.runnercfg.Provider.Data["workerLocation"]; ok {
		for k, v := range workerLocation.(map[string]string) {
			state.WorkerLocation[k] = v
		}
	}

	return nil
}

func (p *StaticProvider) UseCachedRun(run *run.State) error {
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

func New(runnercfg *cfg.RunnerConfig) (provider.Provider, error) {
	return new(runnercfg, nil)
}

func Usage() string {
	return `
The providerType "static" is intended for workers provisioned with worker-manager
providers using providerType "static".  It requires

` + "```yaml" + `
provider:
    providerType: static
    rootURL: ..    # note the Golang spelling with capitalized "URL"
    providerID: .. # ..and similarly capitalized ID
    workerPoolID: ...
    workerGroup: ...
    workerID: ...
    staticSecret: ... # shared secret configured for this worker in worker-manager
    # custom properties for TASKCLUSTER_WORKER_LOCATION
    workerLocation:  {prop: val, ..}
` + "```" + `

The [$TASKCLUSTER_WORKER_LOCATION](https://docs.taskcluster.net/docs/reference/core/worker-manager/)
defined by this provider has the following fields:

* cloud: static

as well as any worker location values from the configuration.
`
}

// New takes its dependencies as optional arguments, allowing injection of fake dependencies for testing.
func new(runnercfg *cfg.RunnerConfig, workerManagerClientFactory tc.WorkerManagerClientFactory) (*StaticProvider, error) {
	if workerManagerClientFactory == nil {
		workerManagerClientFactory = clientFactory
	}
	return &StaticProvider{
		runnercfg:                  runnercfg,
		workerManagerClientFactory: workerManagerClientFactory,
		proto:                      nil,
	}, nil
}
