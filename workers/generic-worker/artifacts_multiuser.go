package main

import (
	"fmt"
	"strings"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v96/workers/generic-worker/runtime"
)

func gwCopyToTempFile(filePath string, pd *process.PlatformData) (string, error) {
	cmd, err := process.NewCommandNoOutputStreams([]string{gwruntime.GenericWorkerBinary(), "copy-to-temp-file", "--copy-file", filePath}, taskContext.TaskDir, []string{}, pd)
	if err != nil {
		return "", fmt.Errorf("failed to create new command to copy file %s to temporary location as task user: %v", filePath, err)
	}

	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to copy file %s to temporary location as task user: %v", filePath, err)
	}

	return strings.TrimSpace(string(output)), nil
}
