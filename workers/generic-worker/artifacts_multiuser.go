//go:build multiuser

package main

import "github.com/taskcluster/taskcluster/v58/workers/generic-worker/process"

func gwCopyToTempFile(exe, filePath string) (*process.Command, error) {
	return process.NewCommandNoOutputStreams([]string{exe, "copy-to-temp-file", "--copy-file", filePath}, taskContext.TaskDir, []string{}, taskContext.pd)
}
