//go:build simple

package main

import (
	"github.com/taskcluster/taskcluster/v58/workers/generic-worker/process"
	"github.com/taskcluster/taskcluster/v58/workers/generic-worker/runtime"
)

func gwCopyToTempFile(filePath string) (*process.Command, error) {
	return process.NewCommand([]string{runtime.GenericWorkerBinary(), "copy-to-temp-file", "--copy-file", filePath}, taskContext.TaskDir, []string{})
}
