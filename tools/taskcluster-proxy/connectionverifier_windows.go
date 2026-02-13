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

	// Always allow SYSTEM (S-1-5-18) and Administrators (S-1-5-32-544) -
	// the worker process runs as SYSTEM/admin and needs to reach tc-proxy
	// for credential refresh and health checks.
	systemSID, _ := windows.StringToSid("S-1-5-18")
	adminSID, _ := windows.StringToSid("S-1-5-32-544")
	if (systemSID != nil && sid.Equals(systemSID)) || (adminSID != nil && sid.Equals(adminSID)) {
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
	tcpTableOwnerPidConnections = 4
	afInet                      = 2
)

func lookupPIDFromTcpTable(addr *net.TCPAddr) (uint32, error) {
	ip4 := addr.IP.To4()
	if ip4 == nil {
		return 0, fmt.Errorf("IPv6 not yet supported on Windows connection verification")
	}

	// First call to get buffer size
	var size uint32
	procGetExtendedTcpTable.Call(0, uintptr(unsafe.Pointer(&size)), 0,
		afInet, tcpTableOwnerPidConnections, 0)

	buf := make([]byte, size)
	ret, _, _ := procGetExtendedTcpTable.Call(
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&size)),
		0, afInet, tcpTableOwnerPidConnections, 0,
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
		if row.LocalAddr == targetIP && row.LocalPort == targetPort {
			return row.OwningPid, nil
		}
	}
	return 0, fmt.Errorf("connection from %s not found in TCP table", addr)
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

	return (*windows.SID)(unsafe.Pointer(tokenUser.User.Sid)), nil
}
