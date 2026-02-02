//go:build insecure

package main

import "github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"

func gwCopyToTempFile(filePath string, pd *process.PlatformData, taskDir string) (string, error) {
	// taskDir is unused in insecure mode - files are accessed directly
	return filePath, nil
}
