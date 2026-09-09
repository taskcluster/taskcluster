package main

import (
	"errors"
	"fmt"
	"log"
	"net"
)

// ConnectionVerifier verifies whether an incoming connection should be
// accepted. Implementations inspect the connection (e.g. peer credentials)
// and return nil to allow it or an error to reject it.
type ConnectionVerifier interface {
	Verify(conn net.Conn) error
}

// ErrUnauthorizedConnection is returned when a connection is rejected because
// the connecting process does not belong to the expected user.
type ErrUnauthorizedConnection struct {
	ExpectedUser string
	ActualUID    string
	RemoteAddr   string
}

func (e *ErrUnauthorizedConnection) Error() string {
	return fmt.Sprintf(
		"unauthorized connection from UID %s at %s (expected user %q)",
		e.ActualUID, e.RemoteAddr, e.ExpectedUser,
	)
}

// errPeerNotFound is returned by platform-specific UID lookups when the
// peer's client-side socket is not visible to this process — most commonly
// because the peer is in a different network namespace (e.g. a container
// connecting via a Docker bridge gateway). When this error is wrapped, the
// network-fallback admission path may admit the connection if its remote
// IP falls within an --allowed-network CIDR.
var errPeerNotFound = errors.New("peer connection not found")

// noopVerifier allows all connections without any verification.
type noopVerifier struct{}

func (n *noopVerifier) Verify(_ net.Conn) error {
	return nil
}

// networkAdmittingVerifier wraps a platform UID verifier with a fallback
// admission rule: connections whose UID lookup fails specifically because
// the peer is invisible (errPeerNotFound) are admitted if their remote IP
// is contained in allowedNetwork. Connections that fail the UID check for
// any other reason — including UID mismatch — are still rejected.
//
// This exists so the d2g + docker-bridge case works: the container's
// client-side socket lives in the container's netns and is therefore not
// in the proxy's /proc/net/tcp. Without this, a UID check would fail
// closed for legitimate in-container traffic.
type networkAdmittingVerifier struct {
	inner          ConnectionVerifier
	allowedNetwork *net.IPNet
}

func (v *networkAdmittingVerifier) Verify(conn net.Conn) error {
	err := v.inner.Verify(conn)
	if err == nil {
		return nil
	}
	if !errors.Is(err, errPeerNotFound) {
		return err
	}
	tcpAddr, ok := conn.RemoteAddr().(*net.TCPAddr)
	if !ok {
		return err
	}
	if v.allowedNetwork.Contains(tcpAddr.IP) {
		return nil
	}
	return err
}

// newConnectionVerifier returns a ConnectionVerifier appropriate for the
// given configuration. If neither username nor allowedNetwork is set, a
// noopVerifier is returned. Otherwise a platform-specific UID verifier
// is created and (when allowedNetwork is non-nil) wrapped with
// networkAdmittingVerifier to admit container traffic whose peer is
// invisible to /proc/net/tcp / lsof / GetExtendedTcpTable.
func newConnectionVerifier(username string, allowedNetwork *net.IPNet) (ConnectionVerifier, error) {
	if username == "" && allowedNetwork == nil {
		return &noopVerifier{}, nil
	}
	platform, err := newPlatformVerifier(username)
	if err != nil {
		return nil, err
	}
	if allowedNetwork == nil {
		return platform, nil
	}
	return &networkAdmittingVerifier{inner: platform, allowedNetwork: allowedNetwork}, nil
}

// verifiedListener wraps a net.Listener and verifies each accepted connection
// using a ConnectionVerifier. Connections that fail verification are logged
// and closed; the listener then continues accepting new connections.
type verifiedListener struct {
	net.Listener
	verifier ConnectionVerifier
}

// Accept waits for and returns the next verified connection. Connections that
// fail verification are closed and a log message is emitted. The method keeps
// accepting until a verified connection arrives or the underlying listener
// returns a permanent error.
func (vl *verifiedListener) Accept() (net.Conn, error) {
	for {
		conn, err := vl.Listener.Accept()
		if err != nil {
			return nil, err
		}
		if verifyErr := vl.verifier.Verify(conn); verifyErr != nil {
			log.Printf("Rejected connection: %v", verifyErr)
			conn.Close()
			continue
		}
		return conn, nil
	}
}
