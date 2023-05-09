package provider

import (
	"fmt"
	"sort"
	"strings"

	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/provider/aws"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/provider/azure"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/provider/google"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/provider/standalone"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/provider/static"
)

type providerInfo struct {
	constructor func(*cfg.RunnerConfig) (provider.Provider, error)
	usage       func() string
}

var providers map[string]providerInfo = map[string]providerInfo{
	"standalone": providerInfo{standalone.New, standalone.Usage},
	"google":     providerInfo{google.New, google.Usage},
	"static":     providerInfo{static.New, static.Usage},
	"aws":        providerInfo{aws.New, aws.Usage},
	"azure":      providerInfo{azure.New, azure.Usage},
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
	rv := []string{strings.ReplaceAll(
		`Providers are configured in the |provider| portion of the runner configuration.  The |providerType| property
determines which provider is in use.  The allowed values are:
`, "|", "`")}

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
		rv = append(rv, fmt.Sprintf("## %s\n\n%s\n", n, usage))
	}
	return strings.Join(rv, "\n")
}
