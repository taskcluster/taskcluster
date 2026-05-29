//go:build darwin

package main

import (
	"net"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLookupUIDWithLsofSelf(t *testing.T) {
	// Create a TCP connection pair and verify that lookupUIDWithLsof
	// returns the current process's UID for the client side.
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

	// The client's local address is the server's RemoteAddr
	clientAddr := server.RemoteAddr().(*net.TCPAddr)

	// Use a bogus proxy PID (0) so we don't filter anything out —
	// we just want to confirm the lookup returns our own UID.
	uid, err := lookupUIDWithLsof(clientAddr, 0)
	require.NoError(t, err)
	assert.Equal(t, uint32(os.Getuid()), uid)
}

func TestLookupUIDWithLsofFiltersProxyPID(t *testing.T) {
	// Verify that when we pass our own PID as the proxyPID, the lookup
	// skips our entry. Since both sides of this connection belong to us,
	// all entries have our PID and should be filtered — resulting in
	// "no UID found".
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

	// Pass our own PID as proxyPID — all lsof entries belong to us,
	// so they should all be filtered out.
	_, err = lookupUIDWithLsof(clientAddr, os.Getpid())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no UID found")
}
