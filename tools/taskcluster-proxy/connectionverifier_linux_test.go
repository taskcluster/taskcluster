//go:build linux

package main

import (
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"strconv"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIpPortToHexIPv4(t *testing.T) {
	tests := []struct {
		ip   string
		port int
		want string
	}{
		{"127.0.0.1", 8080, "0100007F:1F90"},
		{"0.0.0.0", 0, "00000000:0000"},
		{"192.168.1.1", 443, "0101A8C0:01BB"},
		{"10.0.0.1", 65535, "0100000A:FFFF"},
	}
	for _, tt := range tests {
		t.Run(tt.ip, func(t *testing.T) {
			got := ipPortToHex(net.ParseIP(tt.ip), tt.port)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestIpPortToHexIPv6(t *testing.T) {
	tests := []struct {
		name string
		ip   string
		port int
		want string
	}{
		{
			name: "loopback",
			ip:   "::1",
			port: 8080,
			want: "00000000000000000000000001000000:1F90",
		},
		{
			name: "all-zeros",
			ip:   "::",
			port: 0,
			want: "00000000000000000000000000000000:0000",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ipPortToHex(net.ParseIP(tt.ip), tt.port)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestLookupUIDFromProcNetSelf(t *testing.T) {
	// Create a TCP connection and verify lookupUIDFromProcNet returns
	// the current process's UID.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()

	done := make(chan net.Conn, 1)
	go func() {
		conn, _ := ln.Accept()
		done <- conn
	}()

	client, err := net.Dial("tcp", ln.Addr().String())
	require.NoError(t, err)
	defer client.Close()

	server := <-done
	defer server.Close()

	clientAddr := server.RemoteAddr().(*net.TCPAddr)

	uid, err := lookupUIDFromProcNet(clientAddr)
	require.NoError(t, err)
	assert.Equal(t, uint32(os.Getuid()), uid)
}

func TestVerifiedListenerSelfConnection(t *testing.T) {
	// End-to-end: create a verifier for the current user, connect, verify.
	// This test only runs on Linux because the Darwin verifier filters by
	// PID, and in a single-process test both sides share the same PID.
	u, err := user.Current()
	require.NoError(t, err)

	v, err := newConnectionVerifier(u.Username, nil)
	require.NoError(t, err)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()

	vl := &verifiedListener{
		Listener: ln,
		verifier: v,
	}

	go func() {
		conn, dialErr := net.Dial("tcp", ln.Addr().String())
		if dialErr == nil {
			// Keep open; deferred ln.Close() will unblock Accept
			// and the test will clean up.
			defer conn.Close()
			select {}
		}
	}()

	conn, err := vl.Accept()
	require.NoError(t, err)
	conn.Close()
}

// TestProxyRejectsForeignUser proves the parallel-task isolation
// property at the proxy level: a verifiedListener restricted to user A
// (--allowed-user) must reject a TCP/HTTP request from a process
// running as user B.
//
// The test stands up a real verifiedListener fronting a trivial HTTP
// handler, then has a child subprocess (running as a different OS user
// via SysProcAttr.Credential) attempt an HTTP GET. The child's exit
// status tells us whether it was admitted (200 OK) or rejected
// (connection-reset / EOF on read).
//
// Skipped without root (cannot setuid the child), skipped if no
// non-root system user is reachable.
func TestProxyRejectsForeignUser(t *testing.T) {
	if os.Getuid() != 0 {
		t.Skip("requires root to setuid the connecting child")
	}
	foreignUID, ok := pickNonRootUID(t)
	if !ok {
		t.Skip("no usable non-root UID on this host")
	}

	server, addr := startVerifiedListener(t, "root")
	t.Cleanup(func() { _ = server.Close() })

	// Sanity check: connecting from this process (root) is admitted by
	// the root-bypass branch of the verifier — proves the listener
	// itself is healthy before we judge the rejection case.
	require.Equal(t, probeAdmitted, probeAsUID(t, addr, 0),
		"root should be admitted by --allowed-user=root")

	// The actual claim under test: a different OS user cannot reach
	// this proxy.
	assert.Equal(t, probeRejected, probeAsUID(t, addr, foreignUID),
		"UID %d should not be able to access a proxy restricted to root",
		foreignUID)
}

// TestProxyIsolationBetweenTwoUsers is the strictly-symmetric version of
// the above — two real verifiedListeners restricted to two different
// non-root OS users (proxyA → userA, proxyB → userB). Each user can
// reach their own proxy, neither can reach the other's. This is the
// closest tc-proxy-level analogue to "two parallel tasks running as
// different OS users on the same worker, neither's task can hit the
// other's proxy."
//
// Skipped without root, or if two distinct non-root system users
// aren't both available on the host. Root bypass is intentionally not
// tested here — every proxy admits root because the worker process
// itself runs as root.
func TestProxyIsolationBetweenTwoUsers(t *testing.T) {
	if os.Getuid() != 0 {
		t.Skip("requires root to setuid the connecting children")
	}
	uidA, uidB, ok := pickTwoNonRootUIDs(t)
	if !ok {
		t.Skip("need two distinct non-root system users; could not find them")
	}
	userA, err := user.LookupId(strconv.FormatUint(uint64(uidA), 10))
	require.NoError(t, err)
	userB, err := user.LookupId(strconv.FormatUint(uint64(uidB), 10))
	require.NoError(t, err)

	srvA, addrA := startVerifiedListener(t, userA.Username)
	t.Cleanup(func() { _ = srvA.Close() })
	srvB, addrB := startVerifiedListener(t, userB.Username)
	t.Cleanup(func() { _ = srvB.Close() })

	cases := []struct {
		name string
		uid  uint32
		addr string
		want probeResult
	}{
		{userA.Username + " -> proxyA", uidA, addrA, probeAdmitted},
		{userA.Username + " -> proxyB", uidA, addrB, probeRejected},
		{userB.Username + " -> proxyA", uidB, addrA, probeRejected},
		{userB.Username + " -> proxyB", uidB, addrB, probeAdmitted},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, probeAsUID(t, tc.addr, tc.uid))
		})
	}
}

// startVerifiedListener spins up a verifiedListener on a free 127.0.0.1
// port that admits only the given OS user and serves a trivial HTTP
// handler returning 200 "OK". Returns the http.Server (for shutdown)
// and the listener's "host:port" address.
func startVerifiedListener(t *testing.T, allowedUser string) (*http.Server, string) {
	t.Helper()
	v, err := newConnectionVerifier(allowedUser, nil)
	require.NoError(t, err, "build verifier for %q", allowedUser)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte("OK"))
		}),
	}
	go func() {
		_ = server.Serve(&verifiedListener{Listener: ln, verifier: v})
	}()
	return server, ln.Addr().String()
}

type probeResult string

const (
	probeAdmitted probeResult = "ADMITTED"
	probeRejected probeResult = "REJECTED"
	probeUnknown  probeResult = "UNKNOWN"
)

// probeAsUID re-invokes the test binary as a child running under the
// given UID, asks it to GET http://addr/, and translates the child's
// exit code back into a probeResult.
func probeAsUID(t *testing.T, addr string, uid uint32) probeResult {
	t.Helper()
	helperBin, err := os.Executable()
	require.NoError(t, err)

	cmd := exec.Command(helperBin, "-test.run=^TestHelperHTTPProbeChild$", "-test.timeout=15s")
	cmd.Env = append(os.Environ(), "HELPER_HTTP_PROBE_TARGET=http://"+addr+"/")
	if uid != 0 {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			Credential: &syscall.Credential{Uid: uid, Gid: uid},
		}
	}
	// Surface child output to make failures debuggable without being
	// noisy on success — the test framework only prints stderr/stdout
	// when -v is set.
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr

	err = cmd.Run()
	if err == nil {
		return probeAdmitted
	}
	var exitErr *exec.ExitError
	if errorsAs(err, &exitErr) {
		switch exitErr.ExitCode() {
		case helperExitAdmitted:
			return probeAdmitted
		case helperExitRejected:
			return probeRejected
		}
	}
	return probeUnknown
}

// errorsAs is a tiny shim so we don't need to pull in the full errors
// package just for one ErrorAs call. It mimics errors.As for the one
// concrete target type used here.
func errorsAs(err error, target **exec.ExitError) bool {
	for err != nil {
		if e, ok := err.(*exec.ExitError); ok {
			*target = e
			return true
		}
		type unwrapper interface{ Unwrap() error }
		u, ok := err.(unwrapper)
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}

const (
	helperExitAdmitted = 0
	helperExitRejected = 10
	helperExitOther    = 11
)

// TestHelperHTTPProbeChild is invoked by probeAsUID as a child process
// running under a specific UID. When HELPER_HTTP_PROBE_TARGET is unset
// it is a normal no-op test. When set, it issues an HTTP GET and exits
// with helperExitAdmitted if a 200 came back, helperExitRejected if
// the connection was reset/closed, or helperExitOther for anything
// else (e.g. unexpected status, network plumbing failure).
func TestHelperHTTPProbeChild(t *testing.T) {
	target := os.Getenv("HELPER_HTTP_PROBE_TARGET")
	if target == "" {
		return
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(target)
	if err != nil {
		// Connection reset / EOF on a verifier-rejected conn surfaces
		// here as a network error from net/http.
		os.Stderr.WriteString("HelperHTTPProbeChild: GET error: " + err.Error() + "\n")
		os.Exit(helperExitRejected)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		os.Stderr.WriteString("HelperHTTPProbeChild: unexpected status: " + resp.Status + "\n")
		os.Exit(helperExitOther)
	}
	os.Exit(helperExitAdmitted)
}

// pickNonRootUID returns one non-root UID for an account that exists
// on the host. Tries "nobody" first; falls back to scanning a small
// list of system accounts that are present on most Linux distributions.
func pickNonRootUID(t *testing.T) (uint32, bool) {
	t.Helper()
	for _, name := range nonRootCandidates() {
		uid, ok := lookupNonRootUID(name)
		if ok {
			return uid, true
		}
	}
	return 0, false
}

// pickTwoNonRootUIDs returns two distinct non-root UIDs for accounts
// that exist on the host. Used by the cross-user isolation test.
func pickTwoNonRootUIDs(t *testing.T) (uint32, uint32, bool) {
	t.Helper()
	seen := map[uint32]bool{}
	var uids []uint32
	for _, name := range nonRootCandidates() {
		uid, ok := lookupNonRootUID(name)
		if !ok || seen[uid] {
			continue
		}
		seen[uid] = true
		uids = append(uids, uid)
		if len(uids) == 2 {
			return uids[0], uids[1], true
		}
	}
	return 0, 0, false
}

func nonRootCandidates() []string {
	// Common system accounts present on most Linux distros. Order
	// matters only for which two are picked first; any pair works.
	return []string{
		"nobody",
		"daemon",
		"bin",
		"sys",
		"mail",
		"www-data",
		"sshd",
	}
}

func lookupNonRootUID(name string) (uint32, bool) {
	u, err := user.Lookup(name)
	if err != nil {
		return 0, false
	}
	uid, err := strconv.ParseUint(u.Uid, 10, 32)
	if err != nil || uid == 0 {
		return 0, false
	}
	return uint32(uid), true
}
