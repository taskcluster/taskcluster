// +build multiuser,linux multiuser,darwin

package main

import (
	"github.com/taskcluster/generic-worker/process"
)

func (cot *ChainOfTrustTaskFeature) catCotKeyCommand() (*process.Command, error) {
	return process.NewCommand([]string{"/bin/cat", config.Ed25519SigningKeyLocation}, cwd, cot.task.EnvVars(), taskContext.pd)
}
