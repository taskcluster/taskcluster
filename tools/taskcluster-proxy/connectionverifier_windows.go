//go:build windows

package main

import (
	"fmt"
	"net"
	"os/user"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

type windowsVerifier struct {
	allowedSID *windows.SID
	username   string
}

func newPlatformVerifier(username string) (ConnectionVerifier, error) {
	u, err := user.Lookup(username)
	if err != nil {
		return nil, fmt.Errorf("failed to look up user %q: %w", username, err)
	}
	// On Windows, user.User.Uid is the SID string
	sid, err := windows.StringToSid(u.Uid)
	if err != nil {
		return nil, fmt.Errorf("failed to parse SID %q: %w", u.Uid, err)
	}
	return &windowsVerifier{
		allowedSID: sid,
		username:   username,
	}, nil
}

func (v *windowsVerifier) Verify(conn net.Conn) error {
	tcpAddr, ok := conn.RemoteAddr().(*net.TCPAddr)
	if !ok {
		return fmt.Errorf("connection is not TCP")
	}

	pid, err := lookupPIDFromTcpTable(tcpAddr)
	if err != nil {
		return fmt.Errorf("failed to look up PID for %s: %w", tcpAddr, err)
	}

	sid, err := getProcessUserSID(pid)
	if err != nil {
		return fmt.Errorf("failed to get SID for PID %d: %w", pid, err)
	}

	// Always allow SYSTEM (S-1-5-18) - the worker process runs as
	// SYSTEM and needs to reach tc-proxy for credential refresh and
	// health checks. The previous implementation also compared against
	// the Administrators *group* SID (S-1-5-32-544); that check was
	// dead code because tokenUser.User.Sid is always a *user* SID.
	// If we ever need to admit any process running with admin
	// privileges, the correct test is to enumerate token groups via
	// GetTokenGroups, not to compare the user SID.
	systemSID, _ := windows.StringToSid("S-1-5-18")
	if systemSID != nil && sid.Equals(systemSID) {
		return nil
	}

	if !v.allowedSID.Equals(sid) {
		return &ErrUnauthorizedConnection{
			ExpectedUser: v.username,
			ActualUID:    sid.String(),
			RemoteAddr:   conn.RemoteAddr().String(),
		}
	}
	return nil
}

type mibTcpRowOwnerPid struct {
	State      uint32
	LocalAddr  uint32
	LocalPort  uint32
	RemoteAddr uint32
	RemotePort uint32
	OwningPid  uint32
}

var (
	modIphlpapi             = windows.NewLazySystemDLL("iphlpapi.dll")
	procGetExtendedTcpTable = modIphlpapi.NewProc("GetExtendedTcpTable")
)

const (
	// TCP_TABLE_OWNER_PID_CONNECTIONS - GetExtendedTcpTable class
	// returning per-connection rows annotated with the owning PID.
	// Not exposed by golang.org/x/sys/windows; defined here from the
	// IP Helper API headers.
	tcpTableOwnerPidConnections = 4
	// MIB_TCP_STATE_ESTAB - matches only fully-established connections.
	// Without this filter, stale TIME_WAIT entries from prior
	// connections that reused the same source port could match before
	// the live ESTABLISHED row and return the wrong owning PID. Also
	// not exposed by golang.org/x/sys/windows.
	mibTcpStateEstab = 5
)

// lookupPIDFromTcpTable finds the PID owning the local TCP endpoint at addr.
// Only IPv4 is supported via MIB_TCPTABLE_OWNER_PID (AF_INET). Pure IPv6
// and IPv4-mapped-IPv6 addresses (e.g. ::ffff:127.0.0.1) are rejected
// fail-closed. A follow-up may add MIB_TCP6TABLE_OWNER_PID support if
// Windows workers need IPv6 loopback.
func lookupPIDFromTcpTable(addr *net.TCPAddr) (uint32, error) {
	ip4 := addr.IP.To4()
	if ip4 == nil {
		return 0, fmt.Errorf("IPv6 not yet supported on Windows connection verification")
	}

	// First call to get buffer size. We MUST inspect the return value
	// here: only ERROR_INSUFFICIENT_BUFFER guarantees the `size`
	// out-parameter has been written. Other failures (low memory,
	// ERROR_INVALID_PARAMETER, etc.) leave `size` at zero, in which
	// case allocating make([]byte, 0) and dereferencing &buf[0] below
	// would panic and kill the proxy. Fail closed instead.
	var size uint32
	probe, _, _ := procGetExtendedTcpTable.Call(0, uintptr(unsafe.Pointer(&size)), 0,
		windows.AF_INET, tcpTableOwnerPidConnections, 0)
	if syscall.Errno(probe) != windows.ERROR_INSUFFICIENT_BUFFER {
		return 0, fmt.Errorf("GetExtendedTcpTable size probe failed with code %d", probe)
	}
	if size == 0 {
		return 0, fmt.Errorf("GetExtendedTcpTable returned zero buffer size")
	}

	buf := make([]byte, size)
	ret, _, _ := procGetExtendedTcpTable.Call(
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&size)),
		0, windows.AF_INET, tcpTableOwnerPidConnections, 0,
	)
	if ret != 0 {
		return 0, fmt.Errorf("GetExtendedTcpTable failed with code %d", ret)
	}

	numEntries := *(*uint32)(unsafe.Pointer(&buf[0]))
	rows := unsafe.Slice((*mibTcpRowOwnerPid)(unsafe.Pointer(&buf[4])), numEntries)

	targetIP := uint32(ip4[0]) | uint32(ip4[1])<<8 | uint32(ip4[2])<<16 | uint32(ip4[3])<<24
	// Port in the TCP table is in network byte order (big-endian)
	targetPort := uint32(addr.Port)<<8&0xff00 | uint32(addr.Port)>>8&0x00ff

	for _, row := range rows {
		if row.State == mibTcpStateEstab && row.LocalAddr == targetIP && row.LocalPort == targetPort {
			return row.OwningPid, nil
		}
	}
	return 0, fmt.Errorf("connection from %s not found in TCP table: %w", addr, errPeerNotFound)
}

func getProcessUserSID(pid uint32) (*windows.SID, error) {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_INFORMATION, false, pid)
	if err != nil {
		return nil, fmt.Errorf("OpenProcess: %w", err)
	}
	defer windows.CloseHandle(handle)

	var token syscall.Token
	err = syscall.OpenProcessToken(syscall.Handle(handle), syscall.TOKEN_QUERY, &token)
	if err != nil {
		return nil, fmt.Errorf("OpenProcessToken: %w", err)
	}
	defer token.Close()

	tokenUser, err := token.GetTokenUser()
	if err != nil {
		return nil, fmt.Errorf("GetTokenUser: %w", err)
	}

	// Copy the SID so the returned pointer doesn't alias the tokenUser
	// buffer, which may be garbage-collected after this function returns.
	sid := (*windows.SID)(unsafe.Pointer(tokenUser.User.Sid))
	return sid.Copy()
}
