//go:build insecure

package main

import (
	"github.com/taskcluster/taskcluster/v62/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v62/workers/generic-worker/runtime"
)

func gwCopyToTempFile(filePath string) (*process.Command, error) {
	return process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "copy-to-temp-file", "--copy-file", filePath}, "", []string{})
}
