package worker

import (
	"fmt"
	"strings"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
)

type workerInfo struct {
	constructor func(*cfg.RunnerConfig) (Worker, error)
	usage       func() string
}

var workers map[string]workerInfo = map[string]workerInfo{
	"dummy": workerInfo{NewDummy, DummyUsage},
}

// Worker is responsible for determining the identity of this worker and gathering
// Takcluster credentials.
type Worker interface {
	// Configure the given run.  This is expected to set the Taskcluster deployment
	// and worker-information fields, but may modify any part of the run it desires.
	ConfigureRun(run *runner.Run) error

	// Actually start the worker.
	StartWorker(run *runner.Run) error
}

func New(cfg *cfg.RunnerConfig) (Worker, error) {
	if cfg.Worker.Implementation == "" {
		return nil, fmt.Errorf("No worker implementation given in configuration")
	}

	pi, ok := workers[cfg.Worker.Implementation]
	if !ok {
		return nil, fmt.Errorf("Unrecognized worker implementation %s", cfg.Worker.Implementation)
	}
	return pi.constructor(cfg)
}

func Usage() string {
	rv := []string{`
The following worker implementations are supported:`}

	for _, pi := range workers {
		rv = append(rv, pi.usage())
	}
	return strings.Join(rv, "\n")
}
