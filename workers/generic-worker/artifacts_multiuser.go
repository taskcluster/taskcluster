//go:build multiuser

package main

import (
	"github.com/taskcluster/taskcluster/v59/workers/generic-worker/process"
	"github.com/taskcluster/taskcluster/v59/workers/generic-worker/runtime"
)

func gwCopyToTempFile(filePath string) (*process.Command, error) {
	return process.NewCommandNoOutputStreams([]string{runtime.GenericWorkerBinary(), "copy-to-temp-file", "--copy-file", filePath}, taskContext.TaskDir, []string{}, taskContext.pd)
}
