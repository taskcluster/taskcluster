package static

import (
	"fmt"

	tcurls "github.com/taskcluster/taskcluster-lib-urls"
	tcclient "github.com/taskcluster/taskcluster/v30/clients/client-go"
	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v30/internal/workerproto"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/tc"
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
	proto                      *workerproto.Protocol
}

func (p *StaticProvider) ConfigureRun(state *run.State) error {
	var pc staticProviderConfig
	err := p.runnercfg.Provider.Unpack(&pc)
	if err != nil {
		return err
	}

	state.RootURL = tcurls.NormalizeRootURL(pc.RootURL)

	// We need a worker manager client for fetching taskcluster credentials.
	// Ensure auth is disabled in client, since we don't have credentials yet.
	wm, err := p.workerManagerClientFactory(state.RootURL, nil)
	if err != nil {
		return fmt.Errorf("Could not create worker manager client: %v", err)
	}

	workerIdentityProofMap := map[string]interface{}{"staticSecret": interface{}(pc.StaticSecret)}

	workerConfig, err := provider.RegisterWorker(state, wm, pc.WorkerPoolID, pc.ProviderID, pc.WorkerGroup, pc.WorkerID, workerIdentityProofMap)
	if err != nil {
		return err
	}

	pwc, err := cfg.ParseProviderWorkerConfig(p.runnercfg, workerConfig)
	if err != nil {
		return err
	}

	state.WorkerConfig = state.WorkerConfig.Merge(pwc.Config)
	state.Files = append(state.Files, pwc.Files...)

	state.WorkerLocation = map[string]string{
		"cloud": "static",
	}

	if workerLocation, ok := p.runnercfg.Provider.Data["workerLocation"]; ok {
		for k, v := range workerLocation.(map[string]interface{}) {
			state.WorkerLocation[k], ok = v.(string)
			if !ok {
				return fmt.Errorf("workerLocation value %s is not a string", k)
			}
		}
	}

	state.ProviderMetadata = map[string]interface{}{}

	if providerMetadata, ok := p.runnercfg.Provider.Data["providerMetadata"]; ok {
		for k, v := range providerMetadata.(map[string]interface{}) {
			state.ProviderMetadata[k] = v
		}
	}

	return nil
}

func (p *StaticProvider) UseCachedRun(run *run.State) error {
	return nil
}

func (p *StaticProvider) SetProtocol(proto *workerproto.Protocol) {
	p.proto = proto
}

func (p *StaticProvider) WorkerStarted(state *run.State) error {
	return nil
}

func (p *StaticProvider) WorkerFinished(state *run.State) error {
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
	# (optional) custom provider-metadata entries to be passed to worker
	providerMetadata: {prop: val, ..}
    # (optional) custom properties for TASKCLUSTER_WORKER_LOCATION
	# (values must be strings)
    workerLocation:  {prop: val, ..}
` + "```" + `

The [$TASKCLUSTER_WORKER_LOCATION](https://docs.taskcluster.net/docs/manual/design/env-vars#taskcluster_worker_location)
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
