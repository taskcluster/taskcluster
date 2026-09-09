//go:build insecure

package main

import "github.com/taskcluster/taskcluster/v108/workers/generic-worker/process"

func gwCopyToTempFile(filePath string, pd *process.PlatformData, taskDir string) (string, error) {
	return filePath, nil
}
