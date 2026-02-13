package main

import (
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

// noopVerifier allows all connections without any verification.
type noopVerifier struct{}

func (n *noopVerifier) Verify(_ net.Conn) error {
	return nil
}

// newConnectionVerifier returns a ConnectionVerifier appropriate for the given
// username. If username is empty, a noopVerifier is returned that allows all
// connections. Otherwise, a platform-specific verifier is created via
// newPlatformVerifier.
func newConnectionVerifier(username string) (ConnectionVerifier, error) {
	if username == "" {
		return &noopVerifier{}, nil
	}
	return newPlatformVerifier(username)
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
