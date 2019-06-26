package dummy

import (
	"log"

	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/worker/worker"
	yaml "gopkg.in/yaml.v3"
)

type dummy struct {
	runnercfg *runner.RunnerConfig
}

func (d *dummy) ConfigureRun(run *runner.Run) error {
	return nil
}

func (d *dummy) StartWorker(run *runner.Run) (protocol.Transport, error) {
	out, err := yaml.Marshal(run)
	if err != nil {
		return nil, err
	}
	log.Printf("Run information:\n%s", out)
	return protocol.NewNullTransport(), nil
}

func (d *dummy) SetProtocol(proto *protocol.Protocol) {
}

func (d *dummy) Wait() error {
	return nil
}

func New(runnercfg *runner.RunnerConfig) (worker.Worker, error) {
	return &dummy{runnercfg}, nil
}

func Usage() string {
	return `
The "dummy" worker implementation does nothing but dump the run instead of
"starting" anything.  It is intended for debugging.
`
}
