package genericworker

import (
	"log"
	"os"
	"os/exec"

	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/util"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
)

// runMethod allows supporting both run-as-a-service and run-as-an-executable modes.
type runMethod interface {
	start(w *genericworker, state *run.State) (workerproto.Transport, error)
	wait() error
}

// run with a command

func newCmdRunMethod() (runMethod, error) {
	return &cmdRunMethod{}, nil
}

type cmdRunMethod struct {
	cmd *exec.Cmd
}

func (m *cmdRunMethod) start(w *genericworker, state *run.State) (workerproto.Transport, error) {
	// path to generic-worker binary
	cmd := exec.Command(w.wicfg.Path)
	cmd.Env = os.Environ()
	cmd.Stderr = os.Stderr

	cmdStdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmdStdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	transp := workerproto.NewPipeTransport(cmdStdout, cmdStdin)

	// pass config to generic-worker
	cmd.Args = append(cmd.Args, "run", "--config", w.wicfg.ConfigPath, "--with-worker-runner")

	m.cmd = cmd

	err = cmd.Start()
	if err != nil {
		return nil, err
	}

	if err = util.DisableOOM(cmd.Process.Pid); err != nil {
		log.Printf("Error disabling OOM killer for generic-worker: %v", err)
	}

	return transp, nil
}

func (m *cmdRunMethod) wait() error {
	return m.cmd.Wait()
}
