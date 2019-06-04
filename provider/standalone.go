package provider

import (
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
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
	cfg *cfg.RunnerConfig
}

func (p *StandaloneProvider) ConfigureRun(run *runner.Run) error {
	var pc standaloneProviderConfig
	err := p.cfg.Provider.Unpack(&pc)
	if err != nil {
		return err
	}

	run.RootURL = pc.RootURL
	run.Credentials.ClientID = pc.ClientID
	run.Credentials.AccessToken = pc.AccessToken
	run.WorkerPoolID = pc.WorkerPoolID
	run.WorkerGroup = pc.WorkerGroup
	run.WorkerID = pc.WorkerID

	return nil
}

func NewStandalone(cfg *cfg.RunnerConfig) (Provider, error) {
	return &StandaloneProvider{cfg}, nil
}
