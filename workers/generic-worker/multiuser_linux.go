//go:build multiuser

package main

func defaultTasksDir() string {
	return "/home"
}

func platformFeatures() []Feature {
	return []Feature{
		&RunTaskAsCurrentUserFeature{},
		&InteractiveFeature{},
		&LoopbackAudioFeature{},
		&LoopbackVideoFeature{},
		// keep chain of trust as low down as possible, as it checks permissions
		// of signing key file, and a feature could change them, so we want these
		// checks as late as possible
		&ChainOfTrustFeature{},
	}
}
