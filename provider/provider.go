package provider

import (
	"fmt"
	"sort"
	"strings"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/provider/awsprovisioner"
	"github.com/taskcluster/taskcluster-worker-runner/provider/google"
	"github.com/taskcluster/taskcluster-worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster-worker-runner/provider/standalone"
	"github.com/taskcluster/taskcluster-worker-runner/provider/static"
)

type providerInfo struct {
	constructor func(*cfg.RunnerConfig) (provider.Provider, error)
	usage       func() string
}

var providers map[string]providerInfo = map[string]providerInfo{
	"standalone":      providerInfo{standalone.New, standalone.Usage},
	"aws-provisioner": providerInfo{awsprovisioner.New, awsprovisioner.Usage},
	"google":          providerInfo{google.New, google.Usage},
	"static":          providerInfo{static.New, static.Usage},
}

func New(runnercfg *cfg.RunnerConfig) (provider.Provider, error) {
	if runnercfg.Provider.ProviderType == "" {
		return nil, fmt.Errorf("No provider given in configuration")
	}

	pi, ok := providers[runnercfg.Provider.ProviderType]
	if !ok {
		return nil, fmt.Errorf("Unrecognized provider type %s", runnercfg.Provider.ProviderType)
	}
	return pi.constructor(runnercfg)
}

func Usage() string {
	rv := []string{`## Providers

Providers configuration depends on the providerType:
`}

	sortedProviders := make([]string, len(providers))
	i := 0
	for n := range providers {
		sortedProviders[i] = n
		i++
	}
	sort.Strings(sortedProviders)

	for _, n := range sortedProviders {
		info := providers[n]
		usage := strings.Trim(info.usage(), " \n\t")
		rv = append(rv, fmt.Sprintf("### %s\n\n%s\n", n, usage))
	}
	return strings.Join(rv, "\n")
}
