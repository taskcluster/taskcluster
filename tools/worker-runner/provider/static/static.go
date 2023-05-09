package static

import (
	"errors"
	"fmt"

	tcurls "github.com/taskcluster/taskcluster-lib-urls"
	tcclient "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/tc"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
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
	workerIdentityProof        map[string]interface{}
}

func (p *StaticProvider) ConfigureRun(state *run.State) error {
	state.Lock()
	defer state.Unlock()

	var pc staticProviderConfig
	err := p.runnercfg.Provider.Unpack(&pc)
	if err != nil {
		return err
	}

	state.RootURL = tcurls.NormalizeRootURL(pc.RootURL)
	state.ProviderID = pc.ProviderID
	state.WorkerPoolID = pc.WorkerPoolID
	state.WorkerGroup = pc.WorkerGroup
	state.WorkerID = pc.WorkerID

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

	p.workerIdentityProof = map[string]interface{}{
		"staticSecret": interface{}(pc.StaticSecret),
	}

	return nil
}

func (p *StaticProvider) GetWorkerIdentityProof() (map[string]interface{}, error) {
	return p.workerIdentityProof, nil
}

func (p *StaticProvider) UseCachedRun(run *run.State) error {
	return errors.New("Do not use cacheOverRestarts with static provider")
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

NOTE: do not use the 'cacheOverRestarts' configuration with the static
provider.  The static provider can re-initialize itself "from scratch" on every
startup, and does not need to cache anything.
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
