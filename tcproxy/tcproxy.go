// Package tcproxy provides a simple wrapper around the tcproxy executable.
// After the generic worker is refactored into engines, plugins and a runtime,
// tcproxy will be a plugin instead.
package tcproxy

import (
	"fmt"
	"log"
	"net"
	"os/exec"
	"strconv"
	"sync"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

// TaskclusterProxy provides access to a taskcluster-proxy process running on the OS.
type TaskclusterProxy struct {
	mut      sync.Mutex
	command  *exec.Cmd
	HTTPPort uint16
	Pid      int
}

// New starts a tcproxy OS process using the executable specified, and returns
// a *TaskclusterProxy.
func New(taskclusterProxyExecutable string, httpPort uint16, creds *tcclient.Credentials, taskID string) (*TaskclusterProxy, error) {
	args := []string{
		"--port", strconv.Itoa(int(httpPort)),
		"--client-id", creds.ClientID,
		"--access-token", creds.AccessToken,
	}
	if creds.Certificate != "" {
		args = append(args, "--certificate", creds.Certificate)
	}
	if taskID != "" {
		args = append(args, "--task-id", taskID)
	}
	for _, scope := range creds.AuthorizedScopes {
		args = append(args, scope)
	}
	l := &TaskclusterProxy{
		command:  exec.Command(taskclusterProxyExecutable, args...),
		HTTPPort: httpPort,
	}
	err := l.command.Start()
	// Note - we're assuming here that if the process fails to launch we'll get
	// an error. We should test this to be sure.
	if err != nil {
		return nil, err
	}
	l.Pid = l.command.Process.Pid
	log.Printf("Started taskcluster proxy process (PID %v)", l.Pid)
	// Just to be safe, let's make sure the port is actually active before returning.
	err = waitForPortToBeActive(httpPort)
	return l, err
}

func (l *TaskclusterProxy) Terminate() error {
	l.mut.Lock()
	defer func() {
		l.mut.Unlock()
	}()
	if l.command == nil {
		// if process has already died by other means, mission accomplished, nothing more to do
		return nil
	}
	defer func() {
		log.Printf("Stopped taskcluster proxy process (PID %v)", l.Pid)
		l.HTTPPort = 0
		l.Pid = 0
		l.command = nil
	}()
	return l.command.Process.Kill()
}

func waitForPortToBeActive(port uint16) error {
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", "localhost:"+strconv.Itoa(int(port)), 60*time.Second)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("Timeout waiting for taskcluster-proxy port %v to be active", port)
}
