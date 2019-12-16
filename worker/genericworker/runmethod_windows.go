package genericworker

import (
	"fmt"
	"time"

	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/run"
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

func (m *serviceRunMethod) start(w *genericworker, state *run.State) (protocol.Transport, error) {
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

	// TODO: no protocol support on Windows yet
	return protocol.NewNullTransport(), nil
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
