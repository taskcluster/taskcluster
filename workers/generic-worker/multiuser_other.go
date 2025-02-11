//go:build multiuser && (darwin || freebsd)

package main

func platformFeatures() []Feature {
	return []Feature{
		&RunTaskAsCurrentUserFeature{},
		&InteractiveFeature{},
		// keep chain of trust as low down as possible, as it checks permissions
		// of signing key file, and a feature could change them, so we want these
		// checks as late as possible
		&ChainOfTrustFeature{},
	}
}
