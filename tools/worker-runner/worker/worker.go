package worker

import (
	"fmt"
	"sort"
	"strings"

	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/worker/dockerworker"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/worker/dummy"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/worker/genericworker"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/worker/worker"
)

type workerInfo struct {
	constructor func(*cfg.RunnerConfig) (worker.Worker, error)
	usage       func() string
}

var workers map[string]workerInfo = map[string]workerInfo{
	"dummy":          workerInfo{dummy.New, dummy.Usage},
	"docker-worker":  workerInfo{dockerworker.New, dockerworker.Usage},
	"generic-worker": workerInfo{genericworker.New, genericworker.Usage},
}

func New(runnercfg *cfg.RunnerConfig) (worker.Worker, error) {
	if runnercfg.WorkerImplementation.Implementation == "" {
		return nil, fmt.Errorf("No worker implementation given in configuration")
	}

	pi, ok := workers[runnercfg.WorkerImplementation.Implementation]
	if !ok {
		return nil, fmt.Errorf("Unrecognized worker implementation %s", runnercfg.WorkerImplementation.Implementation)
	}
	return pi.constructor(runnercfg)
}

func Usage() string {
	rv := []string{strings.ReplaceAll(
		`
Information about the worker to run is given in the |worker| property of the runner configuration.
The |implementation| property of this object defines the worker implemenatation. Allowed values
are:
`, "|", "`")}

	sortedWorkers := make([]string, len(workers))
	i := 0
	for n := range workers {
		sortedWorkers[i] = n
		i++
	}
	sort.Strings(sortedWorkers)

	for _, n := range sortedWorkers {
		info := workers[n]
		usage := strings.Trim(info.usage(), " \n\t")
		rv = append(rv, fmt.Sprintf("## %s\n\n%s\n", n, usage))
	}
	return strings.Join(rv, "\n")
}
