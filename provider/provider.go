package provider

import (
	"fmt"
	"strings"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
)

type providerInfo struct {
	constructor func(*cfg.RunnerConfig) (Provider, error)
	usage       func() string
}

var providers map[string]providerInfo = map[string]providerInfo{
	"standalone":      providerInfo{NewStandalone, StandaloneUsage},
	"aws-provisioner": providerInfo{NewAwsProvisioner, AwsProvisionerUsage},
}

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

	pi, ok := providers[cfg.Provider.ProviderType]
	if !ok {
		return nil, fmt.Errorf("Unrecognized provider type %s", cfg.Provider.ProviderType)
	}
	return pi.constructor(cfg)
}

func Usage() string {
	rv := []string{`
Providers configuration depends on the providerType:`}

	for _, pi := range providers {
		rv = append(rv, pi.usage())
	}
	return strings.Join(rv, "\n")
}
