package provider

import (
	"fmt"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
)

// Provider is responsible for determining the identity of this worker and gathering
// Takcluster credentials.
type Provider interface {
	// Configure the given run.  This is expected to set the Taskcluster deployment
	// and worker-information fields, but may modify any part of the run it desires.
	ConfigureRun(run *runner.Run) error
}

func New(cfg *cfg.RunnerConfig) (Provider, error) {
	if cfg.Provider.ProviderType == "" {
		return nil, fmt.Errorf("No provider given in configuration")
	}

	if cfg.Provider.ProviderType == "standalone" {
		return NewStandalone(cfg)
	}

	return nil, fmt.Errorf("Unrecognized provider type %s", cfg.Provider.ProviderType)
}
