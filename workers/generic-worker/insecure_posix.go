//go:build insecure && (darwin || linux || freebsd)

package main

import (
	"os"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
)

func MkdirAllTaskUser(dir string, taskDir string, userName string, pd *process.PlatformData) error {
	return os.MkdirAll(dir, 0700)
}

func CreateFileAsTaskUser(file string, taskDir string, userName string, pd *process.PlatformData) (*os.File, error) {
	return os.Create(file)
}
