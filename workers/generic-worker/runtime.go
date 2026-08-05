package main

import (
	"io"
	"os"

	"github.com/taskcluster/taskcluster/v107/workers/generic-worker/safefs"
)

func safeReservedCopy(path string) (string, error) {
	src, err := safefs.OpenExistingReadonly(path)
	if err != nil {
		return "", err
	}
	defer src.Close()

	tmp, err := os.CreateTemp("", "reserved-artifact-")
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(tmp, src); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return "", err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmp.Name())
		return "", err
	}
	return tmp.Name(), nil
}
