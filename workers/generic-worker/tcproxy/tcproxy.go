// Package tcproxy provides a simple wrapper around the tcproxy executable.
// After the generic worker is refactored into engines, plugins and a runtime,
// tcproxy will be a plugin instead.
package tcproxy

import (
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v102/clients/client-go"
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
//
// If allowedUser is non-empty, it is passed via --allowed-user to enable
// per-connection OS user verification.
//
// If allowedNetwork is non-empty (CIDR form, e.g. "172.18.0.0/16"), it is
// passed via --allowed-network. Connections whose remote IP falls in this
// CIDR are admitted when the OS-level peer-credential lookup is not
// possible (e.g. a container connecting via a Docker bridge gateway —
// the peer socket lives in the container's network namespace and is not
// visible in the proxy's /proc/net/tcp). Connections whose UID is found
// but does not match are still rejected, so a sibling task's host
// process is not admitted just because its source IP happens to be inside
// the CIDR.
func New(taskclusterProxyExecutable string, ipAddress string, httpPort uint16, rootURL string, creds *tcclient.Credentials, allowedUser string, allowedNetwork string) (*TaskclusterProxy, error) {
	args := []string{
		"--port", strconv.Itoa(int(httpPort)),
		"--root-url", rootURL,
		"--client-id", creds.ClientID,
		"--access-token", creds.AccessToken,
		"--ip-address", ipAddress,
	}
	if creds.Certificate != "" {
		args = append(args, "--certificate", creds.Certificate)
	}
	if allowedUser != "" {
		args = append(args, "--allowed-user", allowedUser)
	}
	if allowedNetwork != "" {
		args = append(args, "--allowed-network", allowedNetwork)
	}
	args = append(args, creds.AuthorizedScopes...)
	l := &TaskclusterProxy{
		command:  exec.Command(taskclusterProxyExecutable, args...),
		HTTPPort: httpPort,
	}
	l.command.Stdout = os.Stdout
	l.command.Stderr = os.Stderr
	err := l.command.Start()
	// Note - we're assuming here that if the process fails to launch we'll get
	// an error. We should test this to be sure.
	if err != nil {
		return nil, err
	}
	l.Pid = l.command.Process.Pid
	log.Printf("Started taskcluster proxy process (PID %v)", l.Pid)
	// Wait on the address the launcher itself can reach. When
	// allowedNetwork is set the proxy also binds 127.0.0.1, and
	// dialing that loopback path is more reliable from the host netns
	// than dialing a docker-bridge gateway IP through whatever NAT
	// rules the host is running.
	readinessAddr := ipAddress
	if allowedNetwork != "" {
		readinessAddr = "127.0.0.1"
	}
	if err = waitForPortToBeActive(readinessAddr, httpPort); err != nil {
		killErr := l.command.Process.Kill()
		if killErr != nil {
			log.Printf("Failed to kill taskcluster-proxy process (PID %v) after readiness timeout: %v", l.Pid, killErr)
		} else {
			// Wait for the process to be reaped to avoid zombies
			_, _ = l.command.Process.Wait()
			log.Printf("Killed taskcluster-proxy process (PID %v) after readiness timeout", l.Pid)
		}
		return nil, err
	}
	return l, nil
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
		_, err := l.command.Process.Wait()
		if err != nil {
			log.Printf("Error while waiting for taskcluster proxy to stop: %v", err)
		}
		log.Printf("Stopped taskcluster proxy process (PID %v)", l.Pid)
		l.HTTPPort = 0
		l.Pid = 0
		l.command = nil
	}()
	return l.command.Process.Kill()
}

func waitForPortToBeActive(ipAddress string, port uint16) error {
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", ipAddress+":"+strconv.Itoa(int(port)), 60*time.Second)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("timeout waiting for taskcluster-proxy %v:%v to be active", ipAddress, port)
}
