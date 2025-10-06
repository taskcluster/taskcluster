//go:build insecure

package worker

import "github.com/taskcluster/taskcluster/v90/workers/generic-worker/process"

func gwCopyToTempFile(filePath string, pd *process.PlatformData) (string, error) {
	return filePath, nil
}
