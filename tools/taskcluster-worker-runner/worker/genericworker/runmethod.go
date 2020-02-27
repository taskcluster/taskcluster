package genericworker

import (
	"os"
	"os/exec"

	"github.com/taskcluster/taskcluster/v28/tools/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster/v28/tools/taskcluster-worker-runner/run"
)

// runMethod allows supporting both run-as-a-service and run-as-an-executable modes.
type runMethod interface {
	start(w *genericworker, state *run.State) (protocol.Transport, error)
	wait() error
}

// run with a command

func newCmdRunMethod() (runMethod, error) {
	return &cmdRunMethod{}, nil
}

type cmdRunMethod struct {
	cmd *exec.Cmd
}

func (m *cmdRunMethod) start(w *genericworker, state *run.State) (protocol.Transport, error) {
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
	transp := protocol.NewPipeTransport(cmdStdout, cmdStdin)

	// pass config to generic-worker
	cmd.Args = append(cmd.Args, "run", "--config", w.wicfg.ConfigPath, "--with-worker-runner")

	m.cmd = cmd

	err = cmd.Start()
	if err != nil {
		return nil, err
	}

	return transp, nil
}

func (m *cmdRunMethod) wait() error {
	return m.cmd.Wait()
}
