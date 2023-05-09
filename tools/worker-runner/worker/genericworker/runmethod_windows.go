package genericworker

import (
	"fmt"
	"io"
	"log"
	"os/user"
	"time"

	"github.com/Microsoft/go-winio"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

func newServiceRunMethod() (runMethod, error) {
	return &serviceRunMethod{}, nil
}

type serviceRunMethod struct {
	serviceName string
	mgr         *mgr.Mgr
}

func (m *serviceRunMethod) start(w *genericworker, state *run.State) (workerproto.Transport, error) {
	var err error

	m.serviceName = w.wicfg.Service
	m.mgr, err = mgr.Connect()
	if err != nil {
		return nil, fmt.Errorf("Error opening service manager: %s", err)
	}

	s, err := m.mgr.OpenService(m.serviceName)
	if err != nil {
		return nil, fmt.Errorf("Error getting service %s: %s", m.serviceName, err)
	}
	defer s.Close()

	err = s.Start()
	if err != nil {
		return nil, fmt.Errorf("Error starting service %s: %s", m.serviceName, err)
	}

	// connect the transport to the named
	inputReader, inputWriter := io.Pipe()
	outputReader, outputWriter := io.Pipe()
	transp := workerproto.NewPipeTransport(inputReader, outputWriter)

	err = m.connectPipeToProtocol(w.wicfg.ProtocolPipe, inputWriter, outputReader)
	if err != nil {
		return nil, err
	}

	return transp, nil
}

// Connect the configured named pipe to the worker-runner workerproto.  This opens
// the named pipe and listens for a single connection, which it considers to be
// from the worker, and does not acccept any further connections.  Aside from
// careful configuration of the security descriptor, this provides an
// additional layer of assurance that this pipe is not used to manipulate the
// worker or worker-runner.
func (m *serviceRunMethod) connectPipeToProtocol(protocolPipe string, inputWriter io.WriteCloser, outputReader io.Reader) error {
	if protocolPipe == "" {
		protocolPipe = `\\.\pipe\generic-worker`
	}

	// Construct a security-descriptor that allows all access to the current
	// user and to "Local System" (shorthand SY)
	cu, err := user.Current()
	if err != nil {
		return fmt.Errorf("Error getting current user: %s", err)
	}

	c := winio.PipeConfig{
		// D: -- DACL
		// P  -- Protected
		// (A;;GA;;;<sid>) -- GENERIC_ALL access for current user
		// (A;;GA;;;SY) -- GENERIC_ALL access for "Local System"
		SecurityDescriptor: fmt.Sprintf("D:P(A;;GA;;;%s)(A;;GA;;;SY)", cu.Uid),
	}
	listener, err := winio.ListenPipe(protocolPipe, &c)
	if err != nil {
		return fmt.Errorf("Error setting up protocolPipe: %s", err)
	}

	go func() {
		conn, err := listener.Accept()
		if err != nil {
			// since this occurs asynchronously, there's not much we can do
			// here other than log about it
			log.Printf("Error accepting connection on protocolPipe: %s", err)
			listener.Close()
			return
		}

		log.Printf("Worker connecteed on protocolPipe")
		listener.Close()

		// copy bidirectionally between this connection and the protocol transport, and do not
		// accept any further connections.  When the pipe is closed, we close the inputWriter.
		go io.Copy(conn, outputReader)
		go func() {
			io.Copy(inputWriter, conn)
			inputWriter.Close()
		}()
	}()

	return nil
}

func (m *serviceRunMethod) wait() error {
	defer m.mgr.Disconnect()

	// poll until the service stops
	for {
		s, err := m.mgr.OpenService(m.serviceName)
		if err != nil {
			return fmt.Errorf("Error while polling service %s status: %s", m.serviceName, err)
		}
		status, err := s.Query()
		s.Close()

		if err != nil {
			return fmt.Errorf("Error querying service %s status: %s", m.serviceName, err)
		}
		if status.State != svc.StartPending && status.State != svc.Running {
			break
		}

		time.Sleep(2 * time.Second)
	}
	return nil
}
