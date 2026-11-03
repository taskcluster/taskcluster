package main

import (
	"github.com/taskcluster/taskcluster/v114/workers/generic-worker/process"
)

func (cot *ChainOfTrustTaskFeature) catCotKeyCommand() (*process.Command, error) {
	return process.NewCommandNoOutputStreams([]string{"cmd.exe", "/c", "type", config.Ed25519SigningKeyLocation}, cwd, nil, cot.task.pd)
}
