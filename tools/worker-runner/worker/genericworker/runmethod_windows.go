package genericworker

import (
	"fmt"
	"io"
	"log"
	"os/user"
	"time"

	"github.com/Microsoft/go-winio"
	"github.com/taskcluster/taskcluster/v92/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v92/tools/workerproto"
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
		return nil, fmt.Errorf("error opening service manager: %s", err)
	}

	s, err := m.mgr.OpenService(m.serviceName)
	if err != nil {
		return nil, fmt.Errorf("error getting service %s: %s", m.serviceName, err)
	}
	defer s.Close()

	err = s.Start()
	if err != nil {
		return nil, fmt.Errorf("error starting service %s: %s", m.serviceName, err)
	}

	// Use two separate unidirectional pipes to eliminate duplex deadlocks
	inputChan := make(chan io.Reader, 1)  // server reads from this (client->server)
	outputChan := make(chan io.Writer, 1) // server writes to this (server->client)

	err = m.connectPipeToProtocol(w.wicfg.ProtocolPipe, inputChan, outputChan)
	if err != nil {
		return nil, err
	}

	// Wait for both connections to be established
	inputConn := <-inputChan
	outputConn := <-outputChan
	transp := workerproto.NewPipeTransport(inputConn, outputConn)

	return transp, nil
}

// Connect the configured named pipe to the worker-runner workerproto.  This opens
// the named pipe and listens for a single connection, which it considers to be
// from the worker, and does not accept any further connections.  Aside from
// careful configuration of the security descriptor, this provides an
// additional layer of assurance that this pipe is not used to manipulate the
// worker or worker-runner.
func (m *serviceRunMethod) connectPipeToProtocol(protocolPipe string, inputChan chan io.Reader, outputChan chan io.Writer) error {
	if protocolPipe == "" {
		protocolPipe = `\\.\pipe\generic-worker`
	}

	// Create two separate pipe names for unidirectional communication
	inputPipeName := protocolPipe + "-input"   // client->server
	outputPipeName := protocolPipe + "-output" // server->client

	// Construct a security-descriptor that allows all access to the current
	// user and to "Local System" (shorthand SY)
	cu, err := user.Current()
	if err != nil {
		return fmt.Errorf("error getting current user: %s", err)
	}

	c := winio.PipeConfig{
		// D: -- DACL
		// P  -- Protected
		// (A;;GA;;;<sid>) -- GENERIC_ALL access for current user
		// (A;;GA;;;SY) -- GENERIC_ALL access for "Local System"
		SecurityDescriptor: fmt.Sprintf("D:P(A;;GA;;;%s)(A;;GA;;;SY)", cu.Uid),
		InputBufferSize:    65536, // 64KiB
		OutputBufferSize:   65536, // 64KiB
	}

	// Create input pipe listener (client->server)
	inputListener, err := winio.ListenPipe(inputPipeName, &c)
	if err != nil {
		return fmt.Errorf("error setting up input protocolPipe: %s", err)
	}

	// Create output pipe listener (server->client)
	outputListener, err := winio.ListenPipe(outputPipeName, &c)
	if err != nil {
		inputListener.Close()
		return fmt.Errorf("error setting up output protocolPipe: %s", err)
	}

	// Accept input connection (client->server)
	go func() {
		conn, err := inputListener.Accept()
		if err != nil {
			log.Printf("Error accepting connection on input protocolPipe: %s", err)
			inputListener.Close()
			return
		}

		log.Printf("Worker connected on input protocolPipe")
		inputListener.Close()
		inputChan <- conn
	}()

	// Accept output connection (server->client)
	go func() {
		conn, err := outputListener.Accept()
		if err != nil {
			log.Printf("Error accepting connection on output protocolPipe: %s", err)
			outputListener.Close()
			return
		}

		log.Printf("Worker connected on output protocolPipe")
		outputListener.Close()
		outputChan <- conn
	}()

	return nil
}

func (m *serviceRunMethod) wait() error {
	defer m.mgr.Disconnect()

	// poll until the service stops
	for {
		s, err := m.mgr.OpenService(m.serviceName)
		if err != nil {
			return fmt.Errorf("error while polling service %s status: %s", m.serviceName, err)
		}
		status, err := s.Query()
		s.Close()

		if err != nil {
			return fmt.Errorf("error querying service %s status: %s", m.serviceName, err)
		}
		if status.ServiceSpecificExitCode == 67 {
			return fmt.Errorf("%s requested immediate reboot", m.serviceName)
		}
		if status.State != svc.StartPending && status.State != svc.Running {
			break
		}

		time.Sleep(2 * time.Second)
	}
	return nil
}
