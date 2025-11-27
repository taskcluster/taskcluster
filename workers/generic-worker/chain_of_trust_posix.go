//go:build multiuser && (darwin || linux || freebsd)

package main

import (
	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/process"
)

func (cot *ChainOfTrustTaskFeature) catCotKeyCommand() (*process.Command, error) {
	return process.NewCommand([]string{"/bin/cat", config.Ed25519SigningKeyLocation}, cwd, cot.task.EnvVars(), cot.task.pd)
}
