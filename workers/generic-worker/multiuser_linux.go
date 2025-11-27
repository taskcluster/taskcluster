//go:build multiuser

package main

import (
	"log"

	gwruntime "github.com/taskcluster/taskcluster/v94/workers/generic-worker/runtime"
)

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

func PreRebootSetup(nextTaskUser *gwruntime.OSUser) {
}

func platformTargets(arguments map[string]any) ExitCode {
	log.Print("Internal error - no target found to run, yet command line parsing successful")
	return INTERNAL_ERROR
}
