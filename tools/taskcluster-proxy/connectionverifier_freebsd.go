//go:build freebsd

package main

import "errors"

// freebsd support for taskcluster-proxy is experimental: connection
// verification (--allowed-user / --allowed-network) is not yet
// implemented. The build still produces a working binary for the
// non-verifying path, but newPlatformVerifier fails closed if the
// operator asks for verification, rather than silently admitting all
// connections.
//
// A native implementation would most likely use sockstat(1) from the
// FreeBSD base system (lsof is a port, not base); see the darwin
// implementation for the shape of the lookup.

var errFreebsdVerifierNotImplemented = errors.New(
	"connection verification (--allowed-user / --allowed-network) is not implemented on freebsd; " +
		"freebsd support for taskcluster-proxy is experimental",
)

func newPlatformVerifier(_ string) (ConnectionVerifier, error) {
	return nil, errFreebsdVerifierNotImplemented
}
