package dummy

import (
	"log"

	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/worker/worker"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
	yaml "gopkg.in/yaml.v3"
)

type dummy struct {
	runnercfg *cfg.RunnerConfig
}

func (d *dummy) ConfigureRun(state *run.State) error {
	return nil
}

func (d *dummy) UseCachedRun(state *run.State) error {
	return nil
}

func (d *dummy) StartWorker(state *run.State) (workerproto.Transport, error) {
	out, err := yaml.Marshal(state)
	if err != nil {
		return nil, err
	}
	log.Printf("State information:\n%s", out)
	return workerproto.NewNullTransport(), nil
}

func (d *dummy) SetProtocol(proto *workerproto.Protocol) {
	// the protocol is running on a null transport, so mark it as initialized
	proto.SetInitialized()
}

func (d *dummy) Wait() error {
	return nil
}

func New(runnercfg *cfg.RunnerConfig) (worker.Worker, error) {
	return &dummy{runnercfg}, nil
}

func Usage() string {
	return `
The "dummy" worker implementation does nothing but dump the state instead of
"starting" anything. It is intended for debugging.

` + "```yaml" + `
worker:
    implementation: dummy
` + "```" + `
`
}
