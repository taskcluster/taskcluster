//go:build linux

package main

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"os/user"
	"strconv"
	"strings"
)

type linuxVerifier struct {
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
	return &linuxVerifier{
		allowedUID: uint32(uid),
		username:   username,
	}, nil
}

func (v *linuxVerifier) Verify(conn net.Conn) error {
	tcpAddr, ok := conn.RemoteAddr().(*net.TCPAddr)
	if !ok {
		return fmt.Errorf("connection is not TCP")
	}

	uid, err := lookupUIDFromProcNet(tcpAddr)
	if err != nil {
		return fmt.Errorf("failed to look up UID for %s: %w", tcpAddr, err)
	}

	// Always allow root (UID 0) — the worker process runs as root and
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

// lookupUIDFromProcNet reads /proc/net/tcp (or tcp6) to find the UID
// owning the given source address/port.
func lookupUIDFromProcNet(addr *net.TCPAddr) (uint32, error) {
	procFile := "/proc/net/tcp"
	if addr.IP.To4() == nil {
		procFile = "/proc/net/tcp6"
	}

	localAddrHex := ipPortToHex(addr.IP, addr.Port)

	f, err := os.Open(procFile)
	if err != nil {
		return 0, fmt.Errorf("failed to open %s: %w", procFile, err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Scan() // skip header line
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 8 {
			continue
		}
		// fields[1] is local_address in hex, fields[7] is UID.
		// We match on the client's local address (which appears as
		// local_address in the client process's entry in /proc/net/tcp).
		if strings.EqualFold(fields[1], localAddrHex) {
			uid, err := strconv.ParseUint(fields[7], 10, 32)
			if err != nil {
				return 0, fmt.Errorf("failed to parse UID from %s: %w", fields[7], err)
			}
			return uint32(uid), nil
		}
	}
	return 0, fmt.Errorf("connection from %s not found in %s", addr, procFile)
}

// ipPortToHex converts an IP and port to the hex format used in /proc/net/tcp.
// IPv4: bytes in little-endian 32-bit word order. IPv6: four 32-bit words, each little-endian.
func ipPortToHex(ip net.IP, port int) string {
	ip4 := ip.To4()
	if ip4 != nil {
		return fmt.Sprintf("%02X%02X%02X%02X:%04X",
			ip4[3], ip4[2], ip4[1], ip4[0], port)
	}
	ip16 := ip.To16()
	var b strings.Builder
	for i := 0; i < 16; i += 4 {
		fmt.Fprintf(&b, "%02X%02X%02X%02X", ip16[i+3], ip16[i+2], ip16[i+1], ip16[i])
	}
	return fmt.Sprintf("%s:%04X", b.String(), port)
}
