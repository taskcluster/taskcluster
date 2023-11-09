//go:build simple

package main

import "github.com/taskcluster/taskcluster/v57/workers/generic-worker/process"

func gwCopyToTempFile(exe, filePath string) (*process.Command, error) {
	return process.NewCommand([]string{exe, "copy-to-temp-file", "--copy-file", filePath}, taskContext.TaskDir, []string{})
}
