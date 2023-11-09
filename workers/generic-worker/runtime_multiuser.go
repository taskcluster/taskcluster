//go:build multiuser

package main

import (
	"github.com/taskcluster/taskcluster/v58/workers/generic-worker/process"
	"github.com/taskcluster/taskcluster/v58/workers/generic-worker/runtime"
)

// This is executed as the task user to ensure that the
// generic-worker binary is readable/executable.
func gwVersion() (*process.Command, error) {
	return process.NewCommand([]string{runtime.GenericWorkerBinary(), "--version"}, taskContext.TaskDir, []string{}, taskContext.pd)
}
