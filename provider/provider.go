package provider

import (
	"fmt"
	"strings"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/provider/awsprovisioner"
	"github.com/taskcluster/taskcluster-worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster-worker-runner/provider/standalone"
)

type providerInfo struct {
	constructor func(*cfg.RunnerConfig) (provider.Provider, error)
	usage       func() string
}

var providers map[string]providerInfo = map[string]providerInfo{
	"standalone":      providerInfo{standalone.New, standalone.Usage},
	"aws-provisioner": providerInfo{awsprovisioner.New, awsprovisioner.Usage},
}

func New(cfg *cfg.RunnerConfig) (provider.Provider, error) {
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
