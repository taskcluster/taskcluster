package dummy

import (
	"log"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/worker/worker"
	yaml "gopkg.in/yaml.v3"
)

type dummy struct {
	cfg *cfg.RunnerConfig
}

func (d *dummy) ConfigureRun(run *runner.Run) error {
	return nil
}

func (d *dummy) StartWorker(run *runner.Run) error {
	out, err := yaml.Marshal(run)
	if err != nil {
		return err
	}
	log.Printf("Run information:\n%s", out)
	return nil
}

func New(cfg *cfg.RunnerConfig) (worker.Worker, error) {
	return &dummy{cfg}, nil
}

func Usage() string {
	return `
The "dummy" worker implementation does nothing but dump the run instead of
"starting" anything.  It is intended for debugging.
`
}
