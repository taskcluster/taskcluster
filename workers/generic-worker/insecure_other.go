//go:build insecure && (darwin || freebsd)

package main

func platformFeatures() []Feature {
	return []Feature{
		// ArtifactFeature last in the list, to match previous behaviour. It
		// may be possible to move further up at some point, but then task
		// log comments might need to be adjusted (since they refer to other
		// features running later in the Stop() method).
		&ArtifactFeature{},
	}
}
