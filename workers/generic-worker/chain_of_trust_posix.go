//go:build multiuser && (darwin || linux || freebsd)

package main

import (
	"github.com/taskcluster/taskcluster/v114/workers/generic-worker/process"
)

func (cot *ChainOfTrustTaskFeature) catCotKeyCommand() (*process.Command, error) {
	return process.NewCommandNoOutputStreams([]string{"/bin/cat", config.Ed25519SigningKeyLocation}, cwd, []string{}, cot.task.pd)
}
