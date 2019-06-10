package worker

import (
	"fmt"
	"strings"

	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/worker/dockerworker"
	"github.com/taskcluster/taskcluster-worker-runner/worker/dummy"
	"github.com/taskcluster/taskcluster-worker-runner/worker/worker"
)

type workerInfo struct {
	constructor func(*runner.RunnerConfig) (worker.Worker, error)
	usage       func() string
}

var workers map[string]workerInfo = map[string]workerInfo{
	"dummy":         workerInfo{dummy.New, dummy.Usage},
	"docker-worker": workerInfo{dockerworker.New, dockerworker.Usage},
}

func New(runnercfg *runner.RunnerConfig) (worker.Worker, error) {
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
	rv := []string{`
The following worker implementations are supported:`}

	for _, pi := range workers {
		rv = append(rv, pi.usage())
	}
	return strings.Join(rv, "\n")
}
