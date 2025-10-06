//go:build multiuser

package worker

import (
	"log"

	gwruntime "github.com/taskcluster/taskcluster/v90/workers/generic-worker/runtime"
)

func defaultTasksDir() string {
	return "/home"
}

func PreRebootSetup(nextTaskUser *gwruntime.OSUser) {
}

func platformTargets(arguments map[string]any) ExitCode {
	log.Print("Internal error - no target found to run, yet command line parsing successful")
	return INTERNAL_ERROR
}
