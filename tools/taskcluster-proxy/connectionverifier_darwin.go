//go:build darwin

package main

import (
	"fmt"
	"net"
	"os/exec"
	"os/user"
	"strconv"
	"strings"
)

type darwinVerifier struct {
	allowedUID uint32
	username   string
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
	}, nil
}

func (v *darwinVerifier) Verify(conn net.Conn) error {
	tcpAddr, ok := conn.RemoteAddr().(*net.TCPAddr)
	if !ok {
		return fmt.Errorf("connection is not TCP")
	}

	uid, err := lookupUIDWithLsof(tcpAddr)
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
// the TCP connection from the given address.
func lookupUIDWithLsof(addr *net.TCPAddr) (uint32, error) {
	// lsof -i tcp@<ip>:<port> -sTCP:ESTABLISHED -F u -n -P
	// -F u: output UID field (prefixed with 'u')
	// -n: no DNS resolution
	// -P: no port name resolution
	out, err := exec.Command("lsof",
		"-i", fmt.Sprintf("tcp@%s:%d", addr.IP, addr.Port),
		"-sTCP:ESTABLISHED",
		"-F", "u",
		"-n", "-P",
	).Output()
	if err != nil {
		return 0, fmt.Errorf("lsof failed: %w", err)
	}

	// Parse lsof -F output: lines starting with 'u' contain the UID
	for _, line := range strings.Split(string(out), "\n") {
		if strings.HasPrefix(line, "u") {
			uid, err := strconv.ParseUint(line[1:], 10, 32)
			if err != nil {
				return 0, fmt.Errorf("failed to parse UID from lsof output %q: %w", line, err)
			}
			return uint32(uid), nil
		}
	}
	return 0, fmt.Errorf("no UID found in lsof output for %s", addr)
}
