package genericworker

import (
	"io"
	"log"
	"os"
	"os/exec"

	"github.com/taskcluster/taskcluster/v27/tools/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster/v27/tools/taskcluster-worker-runner/run"
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
	transp := protocol.NewStdioTransport()

	// path to generic-worker binary
	cmd := exec.Command(w.wicfg.Path)
	cmd.Env = os.Environ()
	cmd.Stdout = transp
	cmd.Stderr = os.Stderr

	// pass config to generic-worker
	cmd.Args = append(cmd.Args, "run", "--config", w.wicfg.ConfigPath, "--with-worker-runner")

	m.cmd = cmd

	// Unfortunately, cmd.Wait does not handle the case where cmd.Stdin is a writer that remains
	// open when the process exits.  Instead, we set up our own copy loop.  This loop in fact
	// runs forever, but for a single-use process like this, that's OK.
	pipe, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	go func() {
		var err error
		_, err = io.Copy(pipe, transp)
		if err != nil {
			// this can occur when the worker exits while we are trying to send a
			// message to it, so we will consider the message lost and shut down
			// as usual.
			log.Printf("Error writing to worker process (ignored): %#v", err)
		}
	}()

	err = cmd.Start()
	if err != nil {
		return nil, err
	}

	return transp, nil
}

func (m *cmdRunMethod) wait() error {
	return m.cmd.Wait()
}
