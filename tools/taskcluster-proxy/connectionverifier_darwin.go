//go:build darwin

package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"os/user"
	"strconv"
	"strings"
	"time"
)

type darwinVerifier struct {
	allowedUID uint32
	username   string
	proxyPID   int
}

func newPlatformVerifier(username string) (ConnectionVerifier, error) {
	u, err := user.Lookup(username)
	if err != nil {
		return nil, fmt.Errorf("failed to look up user %q: %w", username, err)
	}
	uid, err := strconv.ParseUint(u.Uid, 10, 32)
	if err != nil {
		return nil, fmt.Errorf("failed to parse UID %q: %w", u.Uid, err)
	}
	return &darwinVerifier{
		allowedUID: uint32(uid),
		username:   username,
		proxyPID:   os.Getpid(),
	}, nil
}

func (v *darwinVerifier) Verify(conn net.Conn) error {
	tcpAddr, ok := conn.RemoteAddr().(*net.TCPAddr)
	if !ok {
		return fmt.Errorf("connection is not TCP")
	}

	// Verify is invoked once per accepted TCP connection
	// (verifiedListener.Accept). The kernel guarantees a source port
	// stays bound to the same process for the lifetime of that
	// connection, so no cross-call cache is needed; once a connection
	// is admitted by Accept, all subsequent traffic on that conn rides
	// on the verified peer.
	uid, err := lookupUIDWithLsof(tcpAddr, v.proxyPID)
	if err != nil {
		return fmt.Errorf("failed to look up UID for %s: %w", tcpAddr, err)
	}

	// Always allow root (UID 0) - the worker process runs as root and
	// needs to reach tc-proxy for credential refresh and health checks.
	if uid == 0 {
		return nil
	}

	if uid != v.allowedUID {
		return &ErrUnauthorizedConnection{
			ExpectedUser: v.username,
			ActualUID:    strconv.FormatUint(uint64(uid), 10),
			RemoteAddr:   conn.RemoteAddr().String(),
		}
	}
	return nil
}

// lookupUIDWithLsof uses lsof to find the UID of the process that owns
// the TCP connection from the given address. proxyPID is the PID of the
// proxy process itself, which must be excluded from the results because
// lsof -i matches both local and foreign addresses — the proxy's
// accepted-connection entry (foreign = client addr) would otherwise
// shadow the client's entry.
func lookupUIDWithLsof(addr *net.TCPAddr, proxyPID int) (uint32, error) {
	// lsof requires IPv6 literals to be bracketed: tcp@[::1]:8080.
	// Without brackets the tool rejects the spec ("unacceptable Internet
	// address") and the verifier fails closed.
	hostPart := addr.IP.String()
	if addr.IP.To4() == nil {
		hostPart = "[" + hostPart + "]"
	}

	// 5s deadline guards against a wedged lsof (rare but possible with
	// massive open-FD counts) freezing the listener.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// -F pu: output PID ('p' prefix) and UID ('u' prefix) fields
	// -sTCP:ESTABLISHED: only established connections
	// -n -P: no DNS/port name resolution
	out, err := exec.CommandContext(ctx, "lsof",
		"-i", fmt.Sprintf("tcp@%s:%d", hostPart, addr.Port),
		"-sTCP:ESTABLISHED",
		"-F", "pu",
		"-n", "-P",
	).Output()
	if err != nil {
		return 0, fmt.Errorf("lsof failed: %w", err)
	}

	// Parse lsof -F output: 'p' lines carry the PID, 'u' lines the UID.
	// Skip entries whose PID matches the proxy itself.
	var currentPID int
	for line := range strings.SplitSeq(string(out), "\n") {
		if strings.HasPrefix(line, "p") {
			pid, parseErr := strconv.Atoi(line[1:])
			if parseErr != nil {
				continue
			}
			currentPID = pid
		} else if strings.HasPrefix(line, "u") && currentPID != proxyPID {
			uid, parseErr := strconv.ParseUint(line[1:], 10, 32)
			if parseErr != nil {
				return 0, fmt.Errorf("failed to parse UID from lsof output %q: %w", line, parseErr)
			}
			return uint32(uid), nil
		}
	}
	return 0, fmt.Errorf("no UID found in lsof output for %s: %w", addr, errPeerNotFound)
}
