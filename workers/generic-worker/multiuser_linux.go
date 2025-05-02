//go:build multiuser

package main

func defaultTasksDir() string {
	return "/home"
}

func platformFeatures() []Feature {
	return []Feature{
		&RunTaskAsCurrentUserFeature{},
		&LoopbackAudioFeature{},
		&LoopbackVideoFeature{},
		// keep chain of trust as low down as possible, as it checks permissions
		// of signing key file, and a feature could change them, so we want these
		// checks as late as possible
		&ChainOfTrustFeature{},
		// ArtifactFeature second-to-last in the list, to match previous behaviour.
		// It may be possible to move further up at some point, but then task
		// log comments might need to be adjusted (since they refer to other
		// features running later in the Stop() method).
		&ArtifactFeature{},
		// D2GFeature last in the list so that ArtifactFeature can upload
		// any artifacts copied out of the container.
		&D2GFeature{},
	}
}
