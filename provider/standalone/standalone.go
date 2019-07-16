package standalone

import (
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
)

type standaloneProviderConfig struct {
	RootURL      string
	ClientID     string
	AccessToken  string
	WorkerPoolID string
	WorkerGroup  string
	WorkerID     string
}

type StandaloneProvider struct {
	runnercfg *runner.RunnerConfig
}

func (p *StandaloneProvider) ConfigureRun(run *runner.Run) error {
	var pc standaloneProviderConfig
	err := p.runnercfg.Provider.Unpack(&pc)
	if err != nil {
		return err
	}

	run.RootURL = pc.RootURL
	run.Credentials.ClientID = pc.ClientID
	run.Credentials.AccessToken = pc.AccessToken
	run.WorkerPoolID = pc.WorkerPoolID
	run.WorkerGroup = pc.WorkerGroup
	run.WorkerID = pc.WorkerID

	run.ProviderMetadata = map[string]string{}

	return nil
}

func (p *StandaloneProvider) SetProtocol(proto *protocol.Protocol) {
}

func (p *StandaloneProvider) WorkerStarted() error {
	return nil
}

func (p *StandaloneProvider) WorkerFinished() error {
	return nil
}

func New(runnercfg *runner.RunnerConfig) (provider.Provider, error) {
	return &StandaloneProvider{runnercfg}, nil
}

func Usage() string {
	return `
The providerType "standalone" is intended for workers that have all of their
configuration pre-loaded.  Such workers do not interact with the worker manager.
This is not a recommended configuration - prefer to use the static provider.

It requires the following properties be included explicitly in the runner
configuration:

	provider:
		providerType: standalone
		rootURL: ..
		clientID: ..
		accessToken: ..
		workerPoolID: ..
		workerGroup: ..
		workerID: ..
`
}
