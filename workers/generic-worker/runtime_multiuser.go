//go:build multiuser

package main

import (
	"github.com/taskcluster/taskcluster/v73/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v73/workers/generic-worker/runtime"
)

// gwVersion returns a command that will run the
// `generic-worker --version` command as the task user.
// This is used during the startup of the worker to
// ensure that the generic-worker binary is readable/executable
// by the task user.
func gwVersion() (*process.Command, error) {
	return process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "--version"}, "", []string{}, taskContext.pd)
}
