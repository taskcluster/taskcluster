//go:build multiuser

package main

import (
	"github.com/taskcluster/taskcluster/v64/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v64/workers/generic-worker/runtime"
)

func gwCopyToTempFile(filePath string) (*process.Command, error) {
	return process.NewCommandNoOutputStreams([]string{gwruntime.GenericWorkerBinary(), "copy-to-temp-file", "--copy-file", filePath}, taskContext.TaskDir, []string{}, taskContext.pd)
}
