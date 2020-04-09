// The logging package is an internal logging abstraction, designed to handle
// both structured and unstructured data.
package logging

import (
	"fmt"
	"log"
	"sort"
	"strings"

	"github.com/taskcluster/taskcluster/v29/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v29/tools/worker-runner/logging/logging"
	"github.com/taskcluster/taskcluster/v29/tools/worker-runner/logging/stdio"
)

var Destination logging.Logger

func init() {
	// Destination should always be set.  It will be reset based on the runner config
	// once that config has been read, but until that time default to stdio
	Destination = stdio.New(nil)
}

type implInfo struct {
	constructor func(*cfg.RunnerConfig) logging.Logger
	usage       func() string
}

var implementations map[string]implInfo = map[string]implInfo{
	"stdio": implInfo{stdio.New, stdio.Usage},
}

func Configure(runnercfg *cfg.RunnerConfig) {
	if runnercfg.Logging == nil || runnercfg.Logging.Implementation == "" {
		// just stick with the built-in stdio logging
		return
	}
	impl := runnercfg.Logging.Implementation

	li, ok := implementations[impl]
	if !ok {
		log.Printf("Unrecognized logging implementation %s (falling back to stdio)", impl)
		return
	}
	Destination = li.constructor(runnercfg)
}

func Usage() string {
	rv := []string{`## Logging

The following logging implementations are supported:
`}

	sortedImpls := make([]string, len(implementations))
	i := 0
	for n := range implementations {
		sortedImpls[i] = n
		i++
	}
	sort.Strings(sortedImpls)

	for _, n := range sortedImpls {
		info := implementations[n]
		usage := strings.Trim(info.usage(), " \n\t")
		rv = append(rv, fmt.Sprintf("### %s\n\n%s\n", n, usage))
	}
	return strings.Join(rv, "\n")
}
