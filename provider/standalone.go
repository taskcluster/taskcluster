package provider

import (
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
)

type StandaloneProvider struct {
}

func (p *StandaloneProvider) ConfigureRun(run *runner.Run) error {
	return nil
}

func NewStandalone(cfg *cfg.RunnerConfig) (Provider, error) {
	return &StandaloneProvider{}, nil
}
